define(['qlik', 'jquery', 'text!./globeCoordinates.json', './d3.v7'], function(qlik, $, worldJson, d3) {
    'use strict';
    const stateCache = {
        // Add a property to track whether an animation has already run
        animationComplete: {}
    };

    // Constants
    const COUNTRY_STYLES = {
        defaultFill: "#d4dadc",
        selectedFill: "#91c1e5",
        hoverFill: "#b8bfc2",
        defaultStrokeWidth: 0.5,
        selectedStrokeWidth: 1
    };

    
    const GLOBE_RADIUS_FACTOR = 2.5;
    const DRAG_SENSITIVITY = 75;
    const DEFAULT_TILT = -25;

    // Base styles with accessibility
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .qv-extension-qlik-globe {
            width: 100%;
            height: 100%;
            min-height: 400px;
            position: relative;
            overflow: hidden;
        }
        .qv-extension-qlik-globe svg {
            width: 100%;
            height: 100%;
            display: block;
        }
        .zoom-button:active {
            background-color: #e6e6e6 !important;
            transform: scale(0.95);
        }
        .zoom-button:focus {
            outline: 2px solid #0078d4;
        }
        .zoom-controls {
            -webkit-touch-callout: none;
            -webkit-user-select: none;
            user-select: none;
            position: absolute;
            bottom: 20px;
            left: 20px;
            display: flex;
            flex-direction: column;
            gap: 5px;
        }
        .country {
            transition: fill 0.2s ease;
            cursor: pointer;
            pointer-events: all;
        }
        .country.selected {
            stroke: #000;
            stroke-width: ${COUNTRY_STYLES.selectedStrokeWidth};
        }
        .countries {
            pointer-events: all;
        }
        .globe-tooltip {
            position: absolute;
            pointer-events: none;
            background: white;
            padding: 5px;
            border: 1px solid #999;
            border-radius: 3px;
            font-size: 12px;
            z-index: 1000;
        }
        .loading-overlay {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.1);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999;
        }
    `;
    document.head.appendChild(styleElement);
    
    const tooltipStyles = `
        .globe-tooltip {
            position: absolute;
            pointer-events: none;
            background: rgba(255, 255, 255, 0.9);
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 12px;
            box-shadow: 0 2px 6px rgba(0, 0, 0, 0.1);
            z-index: 1000;
            max-width: 200px;
            transition: opacity 0.2s ease;
            transform: translate(-50%, -100%);
            margin-top: -10px;
            text-align: center;
        }
        
        .globe-tooltip::after {
            content: '';
            position: absolute;
            bottom: -6px;
            left: 50%;
            transform: translateX(-50%);
            width: 0;
            height: 0;
            border-left: 6px solid transparent;
            border-right: 6px solid transparent;
            border-top: 6px solid rgba(255, 255, 255, 0.9);
        }
    `;
    // Helper functions
    function getColor(colorObj, defaultColor) {
        return (colorObj && typeof colorObj === 'object' && colorObj.color) || defaultColor;
    }

    function getTooltipPosition(d, projection) {
        // Get the centroid of the country path
        const centroid = d3.geoCentroid(d);
        
        // Check if this country is visible (not on the other side of the globe)
        const currentRotation = projection.rotate();
        const visible = d3.geoDistance(centroid, [-currentRotation[0], -currentRotation[1]]) < Math.PI / 2;
        
        if (!visible) {
            return null; // Country is on the other side of the globe
        }
        
        // Convert geo coordinates to pixel coordinates
        const projectedCoords = projection(centroid);
        return projectedCoords;
    }

    function updateTooltipPositions() {
        // If tooltip is visible, update its position
        if (tooltip.style("display") !== "none") {
            // Get the currently highlighted country
            const highlightedCountry = d3.select(container).select(".country[fill='" + getColor(props.countryHoverColor, COUNTRY_STYLES.hoverFill) + "']");
            
            if (!highlightedCountry.empty()) {
                const d = highlightedCountry.datum();
                const pos = getTooltipPosition(d, props.lastProjection);
                
                if (pos) {
                    tooltip
                        .style("left", `${pos[0]}px`)
                        .style("top", `${pos[1]}px`);
                } else {
                    // Country rotated to back of globe, hide tooltip
                    tooltip
                        .transition()
                        .duration(200)
                        .style("opacity", 0)
                        .on("end", function() {
                            tooltip.style("display", "none");
                        });
                }
            }
        }

        return {
            updateTooltipPositions: updateTooltipPositions
        };
    }

    function updateMeasureValuesAndColorScale(layout) {
        const props = layout.props;
        
        console.log('=== COLOR BY MEASURE DIAGNOSTICS ===');
        console.log('1. Starting updateMeasureValuesAndColorScale()');
        console.log('colorByMeasure setting:', props.colorByMeasure);
        
        // Get measure values if colorByMeasure is enabled
        if (props.colorByMeasure) {
            console.log('2. Collecting measure values...');
            
            // Check if hypercube and measure info exist
            console.log('Has qHyperCube:', !!layout.qHyperCube);
            console.log('Measure Info length:', layout.qHyperCube?.qMeasureInfo?.length || 0);
            console.log('Data Pages available:', !!layout.qHyperCube?.qDataPages?.[0]);
            
            props.measureValues = getCountryMeasureValues(layout);
            console.log('3. Measure values collected:', props.measureValues ? props.measureValues.size : 0, 'countries');
            
            if (props.measureValues && props.measureValues.size > 0) {
                console.log('4. Sample measure values:');
                let i = 0;
                for (const [country, value] of props.measureValues.entries()) {
                    if (i++ < 5) console.log(`   ${country}: ${value}`);
                }
                
                const values = [...props.measureValues.values()];
                const minVal = d3.min(values);
                const maxVal = d3.max(values);
                
                const startColor = getColor(props.measureColorStart, '#e6f3ff');
                const endColor = getColor(props.measureColorEnd, '#1e90ff');
                
                console.log('5. Creating color scale with range:', { minVal, maxVal });
                console.log('   Color range:', { startColor, endColor });
                
                // Create a sequential color scale based on the measure values range
                props.colorScale = d3.scaleSequential(t => d3.interpolate(startColor, endColor)(t))
                    .domain([minVal, maxVal]);
                
                console.log('6. Color Scale created, testing values:');
                [minVal, (minVal + maxVal) / 2, maxVal].forEach(testVal => {
                    console.log(`   Value ${testVal} => Color ${props.colorScale(testVal)}`);
                });
            } else {
                props.colorScale = null;
                console.log('4. No color scale created: No measure values available');
                if (!layout.qHyperCube?.qMeasureInfo || layout.qHyperCube.qMeasureInfo.length === 0) {
                    console.log('   Reason: No measure defined in the hypercube');
                } else if (!layout.qHyperCube?.qDataPages?.[0]) {
                    console.log('   Reason: No data pages available in the hypercube');
                } else {
                    console.log('   Reason: Data format issues or empty measure values');
                }
            }
        } else {
            props.measureValues = null;
            props.colorScale = null;
            console.log('2. Color by measure disabled, no color scale needed');
        }
        
        console.log('=== END COLOR BY MEASURE DIAGNOSTICS ===');
        return props;
    }

    function logError(context, error, layoutId) {
        console.error(`${context}:`, {
            message: error.message,
            stack: error.stack,
            layoutId
        });
    }

    function manageSelections(layout, countryCache) {
        const newSelections = new Set();
        if (layout.qHyperCube?.qDataPages?.[0]) {
            layout.qHyperCube.qDataPages[0].qMatrix.forEach(row => {
                if (row[0]?.qState === 'S' || row[0]?.qState === 'L') {
                    const countryName = row[0].qText.toUpperCase();
                    if (countryCache.has(countryName)) {
                        newSelections.add(countryName);
                    }
                }
            });
        }
        return newSelections;
    }

    function getCountryMeasureValues(layout) {
        const measureValues = new Map();
        console.log('=== MEASURE VALUE COLLECTION DETAILS ===');
        
        // Check if we have data and measures
        if (!layout.qHyperCube) {
            console.log('ERROR: No qHyperCube found in layout');
            console.log(layout);
            return measureValues;
        }
        
        if (!layout.qHyperCube.qMeasureInfo || layout.qHyperCube.qMeasureInfo.length === 0) {
            console.log('ERROR: No measures defined in hypercube');
            console.log('Available dimensions:', layout.qHyperCube.qDimensionInfo?.length || 0);
            return measureValues;
        }
        
        console.log('Measure info:', layout.qHyperCube.qMeasureInfo[0]);
        
        if (!layout.qHyperCube.qDataPages || !layout.qHyperCube.qDataPages[0]) {
            console.log('ERROR: No data pages in hypercube');
            return measureValues;
        }
        
        console.log('Data matrix rows:', layout.qHyperCube.qDataPages[0].qMatrix.length);
        
        // Log first few rows for debugging
        if (layout.qHyperCube.qDataPages[0].qMatrix.length > 0) {
            console.log('First row structure:', JSON.stringify(layout.qHyperCube.qDataPages[0].qMatrix[0]));
        }
        
        let validRows = 0;
        let invalidRows = 0;
        
        // Determine the format of the data
        const firstRow = layout.qHyperCube.qDataPages[0].qMatrix[0];
        const dataFormat = firstRow ? detectDataFormat(firstRow) : 'unknown';
        console.log('Detected data format:', dataFormat);
        
        layout.qHyperCube.qDataPages[0].qMatrix.forEach((row, index) => {
            try {
                if (!row || row.length === 0) {
                    invalidRows++;
                    return;
                }
                
                let countryName = '';
                let measureValue = null;
                
                // Handle different data formats
                switch (dataFormat) {
                    case 'dimension-only':
                        // When we only have dimension data, try to find measure in a different location
                        countryName = row[0].qText.toUpperCase();
                        
                        // Look for the measure value in qMeasureInfo or qGrandTotalRow
                        if (layout.qHyperCube.qGrandTotalRow && 
                            layout.qHyperCube.qGrandTotalRow.length > 0 &&
                            typeof layout.qHyperCube.qGrandTotalRow[0].qNum === 'number') {
                            // This isn't per country, but we don't have country-specific data
                            // so we use the grand total or would need additional logic to get the right measure
                            measureValue = null; // No valid per-country measure available
                        } else {
                            // No valid measure data available
                            measureValue = null;
                        }
                        break;
                        
                    case 'dimension-measure':
                        // Standard case with dimension and measure
                        countryName = row[0].qText.toUpperCase();
                        measureValue = row[1].qNum;
                        break;
                        
                    case 'dimension-measure-alternative':
                        // Alternative format where measure might be in a different position
                        countryName = row[0].qText.toUpperCase();
                        
                        // Find the measure column (might not be at index 1)
                        const measureCol = row.findIndex((cell, idx) => 
                            idx > 0 && cell && typeof cell.qNum === 'number');
                        
                        if (measureCol > 0) {
                            measureValue = row[measureCol].qNum;
                        }
                        break;
                        
                    case 'complex':
                        // More complex data structure
                        // Try to find dimension and measure by examining cell properties
                        const dimCell = row.find(cell => cell && cell.qText && !isNaN(cell.qElemNumber));
                        const measureCell = row.find(cell => cell && typeof cell.qNum === 'number' && !isNaN(cell.qNum));
                        
                        if (dimCell && measureCell) {
                            countryName = dimCell.qText.toUpperCase();
                            measureValue = measureCell.qNum;
                        }
                        break;
                        
                    default:
                        // Unknown format, try basic extraction
                        if (row[0] && row[0].qText) {
                            countryName = row[0].qText.toUpperCase();
                            
                            // Try to find a valid measure value in any cell
                            for (let i = 1; i < row.length; i++) {
                                if (row[i] && typeof row[i].qNum === 'number' && !isNaN(row[i].qNum)) {
                                    measureValue = row[i].qNum;
                                    break;
                                }
                            }
                        }
                }
                
                // Only add to map if we have both country and valid measure
                if (countryName && measureValue !== null && !isNaN(measureValue)) {
                    measureValues.set(countryName, measureValue);
                    validRows++;
                    
                    if (validRows <= 3) {
                        console.log(`Valid row ${index}: Country=${countryName}, Value=${measureValue}`);
                    }
                } else if (countryName) {
                    // We have a country but no valid measure - don't add random values
                    invalidRows++;
                    if (invalidRows <= 3) {
                        console.log(`Row ${index} has country ${countryName} but no valid measure value`);
                    }
                } else {
                    invalidRows++;
                    if (invalidRows <= 3) {
                        console.log(`Invalid data row at index ${index}:`, row);
                    }
                }
            } catch (error) {
                console.error(`Error processing row ${index}:`, error);
                invalidRows++;
            }
        });
        
        console.log(`Loaded ${measureValues.size} country measure values (${validRows} valid rows, ${invalidRows} invalid rows)`);
        console.log('=== END MEASURE VALUE COLLECTION ===');
        return measureValues;
    }

    // Helper function to detect the data format from the first row
    function detectDataFormat(row) {
        if (!row) return 'unknown';
        
        if (row.length === 1 && row[0] && row[0].qText) {
            return 'dimension-only';
        }
        
        if (row.length >= 2 && row[0] && row[0].qText && 
            row[1] && typeof row[1].qNum === 'number' && !isNaN(row[1].qNum)) {
            return 'dimension-measure';
        }
        
        if (row.length >= 2 && row[0] && row[0].qText) {
            // Check if any cell after the first contains measure data
            const hasMeasure = row.some((cell, idx) => 
                idx > 0 && cell && typeof cell.qNum === 'number' && !isNaN(cell.qNum));
            
            if (hasMeasure) {
                return 'dimension-measure-alternative';
            }
        }
        
        // More complex structure
        if (row.some(cell => cell && cell.qText) && 
            row.some(cell => cell && typeof cell.qNum === 'number' && !isNaN(cell.qNum))) {
            return 'complex';
        }
        
        return 'unknown';
    }

    function updateCountryVisuals(countries, props, layout) {
        console.log('=== UPDATING COUNTRY VISUALS ===');
        console.log('Color by measure enabled:', props.colorByMeasure);
        console.log('Has measure values:', props.measureValues ? `Yes (${props.measureValues.size} countries)` : 'No');
        console.log('Has color scale:', !!props.colorScale);
        console.log('Selected countries:', props.selectedCountries.size);
        
        // Diagnostic check of first few countries if we have measure values
        if (props.colorByMeasure && props.measureValues && props.measureValues.size > 0) {
            console.log('Sample measure values:');
            let i = 0;
            for (const [country, value] of props.measureValues.entries()) {
                if (i++ < 3) {
                    const color = props.colorScale ? props.colorScale(value) : 'no color scale';
                    console.log(`   ${country}: ${value} => ${color}`);
                }
            }
        }
        
        // Handle both single country and collections by normalizing the selection
        const selection = countries.size ? countries : d3.selectAll(countries);
        
        console.log('Applying colors to', selection.size ? selection.size() : 'unknown number of', 'countries');
        
        let coloredByMeasure = 0;
        let coloredBySelection = 0;
        let coloredByDefault = 0;
        
        selection
            .attr("class", d => `country ${props.selectedCountries.has(d.properties.name.toUpperCase()) ? 'selected' : ''}`)
            .attr("fill", d => {
                const countryName = d.properties.name.toUpperCase();
                
                // Selected countries take priority
                if (props.selectedCountries.has(countryName)) {
                    coloredBySelection++;
                    return getColor(props.selectedCountryColor, COUNTRY_STYLES.selectedFill);
                }
                
                // Then check for measure-based coloring
                if (props.colorByMeasure && 
                    props.measureValues && 
                    props.measureValues.has(countryName) && 
                    props.colorScale) {
                    const value = props.measureValues.get(countryName);
                    coloredByMeasure++;
                    return props.colorScale(value);
                }
                
                // Default country color
                coloredByDefault++;
                return getColor(props.countryColor, COUNTRY_STYLES.defaultFill);
            })
            .attr("stroke-width", d => 
                props.selectedCountries.has(d.properties.name.toUpperCase()) ?
                    COUNTRY_STYLES.selectedStrokeWidth : COUNTRY_STYLES.defaultStrokeWidth
            )
            .attr("aria-label", d => {
                const countryName = d.properties.name.toUpperCase();
                const baseName = d.properties.name;
                
                if (props.colorByMeasure && props.measureValues && props.measureValues.has(countryName)) {
                    return `${baseName}: ${props.measureValues.get(countryName)}`;
                }
                
                return baseName;
            });
            
        console.log('Color application summary:');
        console.log(`   ${coloredBySelection} countries colored by selection`);
        console.log(`   ${coloredByMeasure} countries colored by measure`);
        console.log(`   ${coloredByDefault} countries colored by default`);
        console.log('=== END UPDATING COUNTRY VISUALS ===');
    }

    function synchronizeSelections(app, layout, countryCache, countries) {
        if (!layout.qHyperCube || !layout.qHyperCube.qDimensionInfo.length) {
            return qlik.Promise.resolve();
        }
    
        const fieldName = layout.qHyperCube.qDimensionInfo[0].qGroupFieldDefs[0];
        try {
            const field = app.field(fieldName);
            layout.props.selectedCountries = manageSelections(layout, countryCache);
            
            // Update measure values and color scale
            updateMeasureValuesAndColorScale(layout);
            
            // Update visuals with new data
            updateCountryVisuals(countries, layout.props, layout);
            return qlik.Promise.resolve();
        } catch (error) {
            logError('Error synchronizing selections', error, layout.qInfo.qId);
            return qlik.Promise.resolve();
        }
    }

    // Globe setup functions
    function setupGlobeProjection(width, height, props) {
        const radius = Math.min(width, height) / GLOBE_RADIUS_FACTOR;
        const minScale = radius * (props.minZoomScale || 0.5);
        const maxScale = radius * (props.maxZoomScale || 2.5);
        const defaultScale = props.currentScale || (radius * (props.initialZoom || 1.25));
        props.currentScale = defaultScale;

        const projection = d3.geoOrthographic()
            .scale(defaultScale)
            .translate([width/2, height/2])
            .center([0, 0])
            .rotate(props.currentRotation);

        props.lastProjection = projection;
        return { projection, path: d3.geoPath().projection(projection), scales: { min: minScale, max: maxScale, default: defaultScale } };
    }

    function createGlobeElements(svg, width, height, path, props) {
        svg.append("circle")
            .attr("cx", width/2)
            .attr("cy", height/2)
            .attr("r", props.currentScale)
            .attr("class", "ocean")
            .attr("fill", getColor(props.oceanColor, "#e6f3ff"));

        const countries = svg.append("g")
            .attr("class", "countries")
            .selectAll("path")
            .data(props.worldData.features)
            .enter()
            .append("path")
            .attr("d", path)
            .attr("stroke", "#999")
            .attr("class", "country");

        svg.append("circle")
            .attr("cx", width/2)
            .attr("cy", height/2)
            .attr("r", props.currentScale)
            .attr("class", "outline")
            .attr("fill", "none")
            .attr("stroke", "#000")
            .attr("stroke-width", 0.25);

        return countries;
    }

    function setupCountryInteractions(countries, props, app, layout, container) {
        const tooltip = d3.select(container).append("div").attr("class", "globe-tooltip").style("display", "none");
        const layoutId = layout.qInfo.qId;
        
        // Initialize state cache if needed
        if (stateCache && !stateCache[layoutId]) {
            stateCache[layoutId] = {
                rotation: props.currentRotation.slice(),
                scale: props.currentScale
            };
        }
    
        countries
            .on("mouseover", function(event, d) {
                // Highlight the country
                d3.select(this).attr("fill", getColor(props.countryHoverColor, COUNTRY_STYLES.hoverFill));
                
                // Get country data
                const countryName = d.properties.name.toUpperCase();
                let tooltipText = d.properties.name;
                
                // Add measure value if available
                if (props.colorByMeasure && props.measureValues && props.measureValues.has(countryName)) {
                    const value = props.measureValues.get(countryName);
                    // Only format and display if we have a valid value
                    if (value !== null && value !== undefined && !isNaN(value)) {
                        const formattedValue = (typeof value === "number") 
                            ? value.toLocaleString(undefined, {maximumFractionDigits: 2})
                            : value;
                        tooltipText = `${d.properties.name}: ${formattedValue}`;
                    }
                }
                
                // Get position for tooltip (in page coordinates)
                const pos = getTooltipPosition(d, props.lastProjection);
                
                // Only show tooltip if country is visible
                if (pos) {
                    // Show and position the tooltip
                    tooltip
                        .html(tooltipText)
                        .style("left", `${pos[0]}px`)
                        .style("top", `${pos[1]}px`)
                        .style("display", "block")
                        .style("opacity", 1);
                }
            })
            .on("mouseout", function(event, d) {
                // Reapply the correct fill based on selection/measure state
                updateCountryVisuals(d3.select(this), props, layout);
                
                // Hide the tooltip
                tooltip
                    .style("opacity", 0)
                    .style("display", "none");
            })
            .on("click", async function(event, d) {
                event.stopPropagation();
                const countryName = d.properties.name.toUpperCase();
                
                if (stateCache) {
                    // Store current state before selection
                    stateCache[layoutId] = {
                        rotation: props.currentRotation.slice(),
                        scale: props.currentScale
                    };
                }
                
                if (layout.qHyperCube && layout.qHyperCube.qDimensionInfo.length > 0) {
                    try {
                        // Make selection in Qlik
                        await app.field(layout.qHyperCube.qDimensionInfo[0].qGroupFieldDefs[0]).toggleSelect(countryName, true);
                        
                        // Update selections
                        props.selectedCountries = manageSelections(layout, props.countryCache);
                        
                        // Update measure values and color scale after selection
                        updateMeasureValuesAndColorScale(layout);
                        
                        // Update visuals with new data
                        updateCountryVisuals(countries, props, layout);
                    } catch (error) {
                        logError('Selection error', error, layout.qInfo.qId);
                    }
                }
            });
    
        // Function to update tooltip positions when the globe rotates
        function updateTooltipPositions() {
            // If tooltip is visible, update its position
            if (tooltip.style("display") !== "none") {
                // Get the currently highlighted country
                const highlightedCountry = d3.select(container).select(".country[fill='" + getColor(props.countryHoverColor, COUNTRY_STYLES.hoverFill) + "']");
                
                if (!highlightedCountry.empty()) {
                    const d = highlightedCountry.datum();
                    const pos = getTooltipPosition(d, props.lastProjection);
                    
                    if (pos) {
                        tooltip
                            .style("left", `${pos[0]}px`)
                            .style("top", `${pos[1]}px`);
                    } else {
                        // Country rotated to back of globe, hide tooltip
                        tooltip
                            .style("opacity", 0)
                            .style("display", "none");
                    }
                }
            }
        }
    
        return {
            updateTooltipPositions: updateTooltipPositions
        };
    }

    function setupZoomControls(container, projection, settings, updateFn, props) {
        const zoomControls = d3.select(container)
            .append("div")
            .attr("class", "zoom-controls")
            .style("display", props.enableZoom ? "flex" : "none");

        function applyVisibility() {
            if (!props.enableZoom) {
                zoomControls.style("display", "none").style("opacity", 0);
                d3.select(container).on(".zoomControls", null);
            } else {
                zoomControls.style("display", "flex");
                if (props.zoomControlsVisibility === "hover") {
                    d3.select(container)
                        .on("mouseenter.zoomControls", () => zoomControls.style("opacity", 1))
                        .on("mouseleave.zoomControls", () => zoomControls.style("opacity", 0));
                    zoomControls.style("opacity", 0).style("transition", "opacity 0.3s ease");
                } else {
                    d3.select(container).on(".zoomControls", null);
                    zoomControls.style("opacity", 1).style("transition", "none");
                }
            }
        }

        applyVisibility();

        const zoomIn = zoomControls.append("button")
            .attr("class", "zoom-button")
            .style("padding", "8px")
            .style("width", "40px")
            .style("height", "40px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "4px")
            .style("background", "white")
            .style("cursor", "pointer")
            .style("font-size", "20px")
            .html("+");

        const resetView = zoomControls.append("button")
            .attr("class", "zoom-button")
            .style("padding", "8px")
            .style("width", "40px")
            .style("height", "40px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "4px")
            .style("background", "white")
            .style("cursor", "pointer")
            .style("font-size", "18px")
            .html(`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>`);

        const zoomOut = zoomControls.append("button")
            .attr("class", "zoom-button")
            .style("padding", "8px")
            .style("width", "40px")
            .style("height", "40px")
            .style("border", "1px solid #ccc")
            .style("border-radius", "4px")
            .style("background", "white")
            .style("cursor", "pointer")
            .style("font-size", "20px")
            .html("−");

        const zoomIndicator = zoomControls.append("div")
            .attr("class", "zoom-indicator")
            .style("text-align", "center")
            .style("margin", "5px 0");

        function updateZoomIndicator(scale) {
            const percentage = Math.round((scale / settings.scales.default) * 100);
            zoomIndicator.text(`${percentage}%`);
        }

        function zoomGlobe(factor) {
            const newScale = Math.max(settings.scales.min, Math.min(settings.scales.max, projection.scale() * factor));
            projection.scale(newScale);
            props.currentScale = newScale;
            props.lastK = newScale / settings.scales.default;
            updateFn(newScale);
            updateZoomIndicator(newScale);
        }

        zoomIn.on("click", () => zoomGlobe(props.zoomSpeed || 1.2));
        zoomOut.on("click", () => zoomGlobe(1 / (props.zoomSpeed || 1.2)));
        resetView.on("click", () => {
            props.currentRotation = [0, DEFAULT_TILT, 0];
            projection.rotate(props.currentRotation);
            const newScale = settings.scales.default;
            projection.scale(newScale);
            props.currentScale = newScale;
            props.lastK = 1;
            updateFn(newScale);
            updateZoomIndicator(newScale);
        });

        updateZoomIndicator(projection.scale());

        return {
            disable: () => {
                d3.select(container).on(".zoomControls", null);
                zoomControls.remove();
            },
            updateIndicator: updateZoomIndicator,
            updateVisibility: applyVisibility
        };
    }

    function setupRotation(projection, props, updateFn, tooltipManager) {
        let rafId;
        const rotationSpeed = props.rotationSpeed / 1000;
    
        function startRotation() {
            if (rafId) cancelAnimationFrame(rafId);
            if (props.rotationSpeed <= 0) return;
    
            let lastTime = Date.now();
            function animate() {
                const currentTime = Date.now();
                const elapsed = currentTime - lastTime;
                lastTime = currentTime;
                props.currentRotation[0] += elapsed * rotationSpeed;
                projection.rotate(props.currentRotation);
                updateFn();
                
                // Update tooltip positions if tooltip manager exists
                if (tooltipManager && typeof tooltipManager.updateTooltipPositions === 'function') {
                    tooltipManager.updateTooltipPositions();
                }
                
                rafId = requestAnimationFrame(animate);
            }
            rafId = requestAnimationFrame(animate);
        }
    
        return {
            start: startRotation,
            stop: () => {
                if (rafId) cancelAnimationFrame(rafId);
                rafId = null;
            }
        };
    }

        function setupInitialAnimation(projection, svg, props, updateFn, layoutId) {
        // Check if animation is already complete for this visualization
        if (stateCache.animationComplete[layoutId]) {
            console.log('Animation already completed for this visualization, skipping');
            return;
        }
        
        // Check if animation is enabled
        const animSettings = props.animationSettings || {};
        if (animSettings.enabled === false) {
            console.log('Initial animation disabled');
            stateCache.animationComplete[layoutId] = true; // Mark as complete even if disabled
            return;
        }
        
        console.log('Setting up initial animation');
        
        // Store original settings to animate from
        const startRotation = animSettings.startRotation || [-120, -20, 0]; // Start from a different angle
        const startScaleFactor = animSettings.startScale || 0.6;
        const startScale = props.currentScale * startScaleFactor; // Start zoomed out
        const targetRotation = props.currentRotation.slice();
        const targetScale = props.currentScale;
        
        // Set initial state
        projection.rotate(startRotation);
        projection.scale(startScale);
        props.currentRotation = startRotation;
        props.currentScale = startScale;
        
        // Apply initial state
        updateFn(startScale);
        
        console.log('Initial animation from:', { rotation: startRotation, scale: startScale });
        console.log('Animation target:', { rotation: targetRotation, scale: targetScale });
        
        // Run the animation
        let startTime = null;
        const duration = animSettings.duration || 2000; // Animation duration in ms
        
        function animate(timestamp) {
            if (!startTime) startTime = timestamp;
            const elapsed = timestamp - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // Use easeInOutCubic for smooth animation
            const easeProgress = progress < 0.5 
                ? 4 * progress * progress * progress 
                : 1 - Math.pow(-2 * progress + 2, 3) / 2;
            
            // Interpolate rotation and scale
            const newRotation = [
                startRotation[0] + (targetRotation[0] - startRotation[0]) * easeProgress,
                startRotation[1] + (targetRotation[1] - startRotation[1]) * easeProgress,
                startRotation[2] + (targetRotation[2] - startRotation[2]) * easeProgress
            ];
            
            const newScale = startScale + (targetScale - startScale) * easeProgress;
            
            // Apply new values
            projection.rotate(newRotation);
            projection.scale(newScale);
            props.currentRotation = newRotation;
            props.currentScale = newScale;
            
            // Update the visualization
            updateFn(newScale);
            
            // Continue animation if not finished
            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                console.log('Initial animation completed');
                stateCache.animationComplete[layoutId] = true; // Mark animation as complete
            }
        }
        
        // Start the animation
        requestAnimationFrame(animate);
    }

    function setupEventHandlers(svg, projection, props, options) {
        const { onDragStart, onDragEnd, onZoom, scales, path, layout } = options;
        let isDragging = false;
        let zoomBehavior = null;

        const countries = svg.selectAll(".country");

        const dragBehavior = d3.drag()
            .on("start", () => { isDragging = true; onDragStart(); })
            .on("drag", (event) => {
                if (!isDragging) return;
                const rotate = projection.rotate();
                const k = DRAG_SENSITIVITY / projection.scale();
                props.currentRotation = [
                    rotate[0] + event.dx * k,
                    Math.max(-90, Math.min(90, rotate[1] - event.dy * k)),
                    rotate[2]
                ];
                projection.rotate(props.currentRotation);
                countries.attr("d", path);
                updateCountryVisuals(countries, props, layout);
                
                // Save state to cache
                stateCache[layout.qInfo.qId] = {
                    rotation: props.currentRotation.slice(),
                    scale: projection.scale()
                };
            })
            .on("end", () => { isDragging = false; onDragEnd(); });


        svg.call(dragBehavior);

        function applyZoomBehavior() {
            // Would implement zoom behavior here if needed
            // Currently this is a placeholder
        }

        applyZoomBehavior();

        return {
            update: (newProps) => {
                // Apply the stored rotation and scale to the projection
                projection.rotate(newProps.currentRotation);
                projection.scale(newProps.currentScale);
                
                // Update the paths based on the projection
                countries.attr("d", path);
                
                // Update country visuals with current measure values and color scale
                updateCountryVisuals(countries, newProps, layout);
                
                // Update zoom behavior
                applyZoomBehavior();
            },
            disable: () => {
                svg.on(".zoom", null);
                svg.on(".drag", null);
                zoomBehavior = null;
            }
        };
    }

    function resetAnimationState(layoutId) {
        if (layoutId && stateCache.animationComplete) {
            delete stateCache.animationComplete[layoutId];
        }
    }

    function handleResize($element, layout) {
        const container = d3.select(`#globe-container-${layout.qInfo.qId}`);
        const svg = container.select('svg');
        if (svg.empty()) {
            logError('Resize failed: SVG not found', new Error('SVG missing'), layout.qInfo.qId);
            return null;
        }

        const width = $element.width();
        const height = $element.height();
        const props = layout.props;

        svg.attr('width', width).attr('height', height);

        const radius = Math.min(width, height) / GLOBE_RADIUS_FACTOR;
        const oldScale = props.lastProjection.scale();
        const oldRadius = Math.min(props.lastProjection.translate()[0] * 2, props.lastProjection.translate()[1] * 2) / GLOBE_RADIUS_FACTOR;
        const scaleRatio = oldScale / oldRadius;
        const newScale = radius * scaleRatio;

        props.lastProjection.translate([width/2, height/2]).scale(newScale);
        const path = d3.geoPath().projection(props.lastProjection);

        svg.selectAll('circle.ocean').attr('cx', width/2).attr('cy', height/2).attr('r', newScale);
        svg.selectAll('path.country').attr('d', path);
        svg.selectAll('circle.outline').attr('cx', width/2).attr('cy', height/2).attr('r', newScale);

        props.currentScale = newScale;
        if (container.node().__zoomControls) {
            container.node().__zoomControls.updateIndicator(newScale);
            container.node().__zoomControls.updateVisibility();
        }
        if (container.node().__eventHandlers) {
            container.node().__eventHandlers.update(props);
        }

        return true;
    }

    const properties = {
        initialProperties: {
            qHyperCubeDef: {
                qDimensions: [],
                qMeasures: [],
                qInitialDataFetch: [{ qWidth: 2, qHeight: 1000 }]
            },
            animationSettings: {
                enabled: true,
                startRotation: [-120, -20, 0],
                startScale: 0.6,
                duration: 2000
            },
            props: {
                rotationSpeed: 20,
                countryColor: { color: COUNTRY_STYLES.defaultFill, index: -1 },
                oceanColor: { color: "#e6f3ff", index: -1 },
                selectedCountryColor: { color: COUNTRY_STYLES.selectedFill, index: -1 },
                countryHoverColor: { color: COUNTRY_STYLES.hoverFill, index: -1 },
                measureColorStart: { color: "#e6f3ff", index: -1 },
                measureColorEnd: { color: "#1e90ff", index: -1 },
                minZoomScale: 0.5,
                maxZoomScale: 2.5,
                initialZoom: 1.25,
                zoomSpeed: 1.2,
                enableZoom: true,
                zoomControlsVisibility: "always",
                colorByMeasure: false,
                currentRotation: [0, DEFAULT_TILT, 0],
                currentScale: null,
                lastK: 1,
                lastProjection: null,
                countryCache: new Map(),
                selectedCountries: new Set(),
                worldData: JSON.parse(worldJson)
            }
        },
        definition: {
            type: "items",
            component: "accordion",
            items: {
                dimensions: { 
                    uses: "dimensions", 
                    min: 1, 
                    max: 1 
                },
                measures: {
                    uses: "measures",
                    min: 0,
                    max: 1
                },
                settings: {
                    uses: "settings",
                    items: {
                        globeSettings: {
                            label: "Globe Settings",
                            type: "items",
                            items: {
                                colorMode: {
                                    ref: "props.colorByMeasure",
                                    label: "Color Mode",
                                    type: "boolean",
                                    component: "switch",
                                    options: [
                                        { value: false, label: "Static" },
                                        { value: true, label: "By Measure" }
                                    ],
                                    defaultValue: false
                                },
                                countryColor: { 
                                    label: "Country Color", 
                                    component: "color-picker", 
                                    ref: "props.countryColor", 
                                    type: "object", 
                                    defaultValue: { index: -1, color: COUNTRY_STYLES.defaultFill },
                                    show: data => !data.props.colorByMeasure
                                },
                                measureColorStart: {
                                    label: "Measure Color Start",
                                    component: "color-picker",
                                    ref: "props.measureColorStart",
                                    type: "object",
                                    defaultValue: { index: -1, color: "#e6f3ff" },
                                    show: data => data.props.colorByMeasure
                                },
                                measureColorEnd: {
                                    label: "Measure Color End",
                                    component: "color-picker",
                                    ref: "props.measureColorEnd",
                                    type: "object",
                                    defaultValue: { index: -1, color: "#1e90ff" },
                                    show: data => data.props.colorByMeasure
                                },
                                selectedCountryColor: { 
                                    label: "Selected Country Color", 
                                    component: "color-picker", 
                                    ref: "props.selectedCountryColor", 
                                    type: "object", 
                                    defaultValue: { index: -1, color: COUNTRY_STYLES.selectedFill } 
                                },
                                countryHoverColor: { 
                                    label: "Country Hover Color", 
                                    component: "color-picker", 
                                    ref: "props.countryHoverColor", 
                                    type: "object", 
                                    defaultValue: { index: -1, color: COUNTRY_STYLES.hoverFill } 
                                },
                                oceanColor: { 
                                    label: "Ocean Color", 
                                    component: "color-picker", 
                                    ref: "props.oceanColor", 
                                    type: "object", 
                                    defaultValue: { index: -1, color: "#e6f3ff" } 
                                },
                                rotationSpeed: { 
                                    ref: "props.rotationSpeed", 
                                    label: "Rotation Speed", 
                                    type: "number", 
                                    component: "slider", 
                                    min: 0, 
                                    max: 100, 
                                    step: 5, 
                                    defaultValue: 20 
                                }
                            }
                        },
                        animationSettings: {
                            label: "Animation Settings",
                            type: "items",
                            items: {
                                enableAnimation: { 
                                    ref: "animationSettings.enabled", 
                                    label: "Enable Initial Animation", 
                                    type: "boolean", 
                                    defaultValue: true 
                                },
                                animationDuration: {
                                    ref: "animationSettings.duration",
                                    label: "Animation Duration (ms)",
                                    type: "number",
                                    component: "slider",
                                    min: 500,
                                    max: 5000,
                                    step: 500,
                                    defaultValue: 2000,
                                    show: function(data) {
                                        return data.animationSettings && data.animationSettings.enabled;
                                    }
                                }
                            }
                        },
                        zoomSettings: {
                            label: "Zoom Settings",
                            type: "items",
                            items: {
                                enableZoom: { ref: "props.enableZoom", label: "Enable Zoom Controls", type: "boolean", defaultValue: true },
                                zoomControlsVisibility: {
                                    ref: "props.zoomControlsVisibility",
                                    label: "Zoom Controls Visibility",
                                    type: "string",
                                    component: "dropdown",
                                    options: [
                                        { value: "always", label: "Always Visible" },
                                        { value: "hover", label: "Show on Hover" },
                                        { value: "never", label: "Never Show" }
                                    ],
                                    defaultValue: "always",
                                    show: data => data.props.enableZoom
                                },
                                minZoomScale: {
                                    ref: "props.minZoomScale",
                                    label: "Minimum Zoom Scale",
                                    type: "number",
                                    component: "slider",
                                    min: 0.1,
                                    max: 1,
                                    step: 0.1,
                                    defaultValue: 0.5
                                },
                                maxZoomScale: {
                                    ref: "props.maxZoomScale",
                                    label: "Maximum Zoom Scale",
                                    type: "number",
                                    component: "slider",
                                    min: 1,
                                    max: 10,
                                    step: 0.5,
                                    defaultValue: 2.5
                                },
                                initialZoom: {
                                    ref: "props.initialZoom",
                                    label: "Initial Zoom Level",
                                    type: "number",
                                    component: "slider",
                                    min: 0.5,
                                    max: 2.5,
                                    step: 0.1,
                                    defaultValue: 1.25
                                },
                                zoomSpeed: {
                                    ref: "props.zoomSpeed",
                                    label: "Zoom Speed Factor",
                                    type: "number",
                                    component: "slider",
                                    min: 1.1,
                                    max: 2,
                                    step: 0.1,
                                    defaultValue: 1.2
                                }
                            }
                        }
                    }
                }
            }
        },
        paint: function($element, layout) {
            try {
                const app = qlik.currApp();
                const props = Object.assign({}, 
                    properties.initialProperties.props, 
                    layout.props || {});
                
                // Ensure animation settings are available
                props.animationSettings = Object.assign({},
                    properties.initialProperties.animationSettings,
                    layout.animationSettings || {});
                
                layout.props = props;
                
                // Apply cached state if available
                const layoutId = layout.qInfo.qId;
                if (stateCache && stateCache[layoutId]) {
                    props.currentRotation = stateCache[layoutId].rotation.slice();
                    props.currentScale = stateCache[layoutId].scale;
                }

                if (!props.worldData?.features) {
                    $element.empty().append('<div class="qv-extension-qlik-globe"><div class="loading-overlay">Error loading globe data</div></div>');
                    throw new Error('Invalid world data');
                }
                
                $element.empty().append(`
                    <div class="qv-extension-qlik-globe">
                        <div id="globe-container-${layout.qInfo.qId}"></div>
                        <div class="loading-overlay">Loading...</div>
                    </div>
                `);

                const container = document.getElementById(`globe-container-${layout.qInfo.qId}`);
                const existingSvg = d3.select(`#globe-container-${layout.qInfo.qId} svg`);

                if (props.minZoomScale >= props.maxZoomScale) {
                    logError('Invalid zoom scales, resetting to defaults', new Error('minZoomScale >= maxZoomScale'), layout.qInfo.qId);
                    props.minZoomScale = 0.5;
                    props.maxZoomScale = 2.5;
                }

                // Build country cache
                props.countryCache.clear();
                props.worldData.features.forEach(feature => {
                    props.countryCache.set(feature.properties.name.toUpperCase(), feature);
                });

                // Update selections, measure values, and color scale
                props.selectedCountries = manageSelections(layout, props.countryCache);
                updateMeasureValuesAndColorScale(layout);

                if (!existingSvg.empty()) {
                    // Update existing visualization
                    updateCountryVisuals(existingSvg.selectAll(".country"), props, layout);
                    const zoomControls = d3.select(`#globe-container-${layout.qInfo.qId} .zoom-controls`);
                    if (!zoomControls.empty() && container.__zoomControls) {
                        container.__zoomControls.updateVisibility();
                    }
                    if (container.__eventHandlers) {
                        container.__eventHandlers.update(props);
                    }
                    $element.find('.loading-overlay').remove();
                    return qlik.Promise.resolve();
                }

                console.log('4. Creating new visualization');
                const width = $element.width();
                const height = $element.height();

                const globeSetup = setupGlobeProjection(width, height, props);
                const { projection, path, scales } = globeSetup;

                const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
                const countries = createGlobeElements(svg, width, height, path, props);
                
                console.log('5. About to update country visuals for new visualization');
                console.log('   colorByMeasure:', props.colorByMeasure);
                console.log('   measureValues size:', props.measureValues ? props.measureValues.size : 0);
                console.log('   Has colorScale:', !!props.colorScale);
                
                updateCountryVisuals(countries, props, layout);
                // In the paint function, replace these lines:
                setupCountryInteractions(countries, props, app, layout, container); 
                // With this single call:
                const tooltipManager = setupCountryInteractions(countries, props, app, layout, container);

                


                const updateGlobe = (scale = projection.scale()) => {
                    svg.selectAll("circle").attr("r", scale);
                    countries.attr("d", path);
                    updateCountryVisuals(countries, props, layout);
                };

                const zoomControls = setupZoomControls(container, projection, { scales }, updateGlobe, props); 

                // Then pass it to setupRotation:
                const rotation = setupRotation(projection, props, updateGlobe, tooltipManager);

                const eventHandlers = setupEventHandlers(svg, projection, props, {
                    onDragStart: () => rotation.stop(),
                    onDragEnd: () => { if (props.rotationSpeed > 0) rotation.start(); },
                    onZoom: updateGlobe,
                    scales,
                    path,
                    layout
                });

                // Run initial animation before starting rotation
                setupInitialAnimation(projection, svg, props, updateGlobe, layout.qInfo.qId);
                
                // Start rotation after a delay to allow the initial animation to complete
                const animationDelay = props.animationSettings?.enabled !== false ? 
                    (props.animationSettings?.duration || 2000) + 500 : 0;
                
                setTimeout(() => {
                    if (props.rotationSpeed > 0) rotation.start();
                }, animationDelay);
                
                updateGlobe(scales.default);
                container.__eventHandlers = eventHandlers;
                container.__zoomControls = zoomControls;

                $element.find('.loading-overlay').remove();
                console.log('=== END PAINT FUNCTION DIAGNOSTICS ===');

                return qlik.Promise.resolve(() => {
                    rotation.stop();
                    d3.select(`#globe-container-${layout.qInfo.qId} .globe-tooltip`).remove();
                    if (eventHandlers?.disable) eventHandlers.disable();
                    if (zoomControls?.disable) zoomControls.disable();
                    container.__eventHandlers = null;
                    container.__zoomControls = null;
                });
            } catch (err) {
                logError('Error in globe visualization', err, layout.qInfo.qId);
                $element.find('.loading-overlay').remove();
                return qlik.Promise.reject(err);
            }
        },
        resize: function($element, layout) {
            let resizeTimeout;
            return new qlik.Promise((resolve) => {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(() => {
                    const resizeResult = handleResize($element, layout);
                    resolve(resizeResult ? qlik.Promise.resolve() : this.paint($element, layout));
                }, 100);
            });
        },
        support: { snapshot: true, export: true, exportData: true }
    };

    return {
        initialProperties: properties.initialProperties,
        definition: properties.definition,
        paint: properties.paint,
        resize: properties.resize,
        support: properties.support
    };
});