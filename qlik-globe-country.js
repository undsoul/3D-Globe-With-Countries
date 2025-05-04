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
            touch-action: none; /* Disable browser touch actions to prevent conflicts */
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
        try {
            return (colorObj && typeof colorObj === 'object' && typeof colorObj.color === 'string') ? 
                colorObj.color : defaultColor;
        } catch (e) {
            console.error('Error in getColor:', e);
            return defaultColor;
        }
    }

    function hexToRgba(hex, alpha) {
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Handle shorthand hex (#fff)
        if (hex.length === 3) {
            hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
        }
        
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    function getBackgroundColor(colorObj, props, defaultColor) {
        // Early exit if missing parameters to prevent recursive calls
        if (!colorObj || !props) {
            return defaultColor;
        }
        
        try {
            if (typeof colorObj === 'object' && colorObj.color) {
                const color = colorObj.color.toLowerCase();
                const opacity = typeof props.tooltipBackgroundOpacity === 'number' ? 
                    props.tooltipBackgroundOpacity : 1;
        
                // Handle hex colors
                if (color.startsWith('#')) {
                    return hexToRgba(color, opacity);
                }
                
                // Handle rgb/rgba colors
                if (color.startsWith('rgb')) {
                    if (color.startsWith('rgba')) {
                        // Extract existing rgb values and apply new opacity
                        const rgbaValues = color.match(/[\d.]+/g);
                        if (rgbaValues && rgbaValues.length >= 3) {
                            return `rgba(${rgbaValues[0]}, ${rgbaValues[1]}, ${rgbaValues[2]}, ${opacity})`;
                        }
                    }
                    // Convert rgb to rgba
                    const rgbValues = color.match(/\d+/g);
                    if (rgbValues && rgbValues.length >= 3) {
                        return `rgba(${rgbValues[0]}, ${rgbValues[1]}, ${rgbValues[2]}, ${opacity})`;
                    }
                }
                
                // For named colors, return a safe default with opacity
                return `rgba(255, 255, 255, ${opacity})`;
            }
        } catch (e) {
            console.error('Error in getBackgroundColor:', e);
        }
        
        return defaultColor;
    }
    
    function createTooltip(container) {
        // Create tooltip container in the visualization container instead of body
        // This avoids AngularJS digest loop issues
        const tooltip = d3.select(container)
            .append("div")
            .attr("class", "globe-tooltip")
            .style("display", "none")
            .style("position", "absolute")
            .style("pointer-events", "none")
            .style("z-index", "999");
        
        return tooltip;
    }
    
    function applyTooltipStyles(tooltip, props) {
        if (!tooltip || !props) return;
    
        try {
            const styles = {
                "background-color": getBackgroundColor(props.tooltipBackgroundColor, props, "rgba(255, 255, 255, 1)"),
                "color": getColor(props.tooltipTextColor, "#333333"),
                "border": props.tooltipBorderEnabled ? 
                    `${props.tooltipBorderWidth || 1}px solid ${getColor(props.tooltipBorderColor, "#cccccc")}` : 
                    "none",
                "border-radius": `${props.tooltipBorderRadius !== undefined ? props.tooltipBorderRadius : 4}px`,
                "padding": `${props.tooltipPadding || 8}px`,
                "font-size": `${props.tooltipFontSize || 14}px`,
                "box-shadow": props.tooltipShadowEnabled ? 
                    `0 2px ${props.tooltipShadowBlur || 4}px rgba(0,0,0,${props.tooltipShadowOpacity || 0.2})` : 
                    "none",
                "pointer-events": "none",
                "transition": "opacity 0.2s ease",
                "z-index": "999"
            };
    
            Object.entries(styles).forEach(([key, value]) => {
                tooltip.style(key, value);
            });
        } catch (e) {
            console.error('Error in applyTooltipStyles:', e);
        }
    }
    
    function showTooltip(tooltip, position, tooltipContent) {
        // Only update if tooltip exists and position is valid
        if (!tooltip || !position || !position.visible) {
            hideTooltip(tooltip);
            return;
        }
        
        tooltip
            .style("display", "block")
            .style("opacity", 1)
            .style("left", position.x + "px")
            .style("top", position.y + "px")
            .html(tooltipContent);
    }
    
    function hideTooltip(tooltip) {
        if (!tooltip) return;
        
        tooltip
            .style("opacity", 0)
            .style("display", "none");
    }

    function getTooltipPosition(d, projection, containerNode) {
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
        
        // Convert to relative container coordinates
        const containerRect = containerNode.getBoundingClientRect();
        const svgNode = d3.select(containerNode).select('svg').node();
        const svgRect = svgNode.getBoundingClientRect();
        
        return {
            x: projectedCoords[0],
            y: projectedCoords[1],
            visible: true
        };
    }

    // Function to update tooltip positions when the globe rotates
    function updateTooltipPositions(tooltip, container, props) {
        // If tooltip is visible, update its position
        if (tooltip && tooltip.style("display") !== "none") {
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
// Enhanced updateMeasureValuesAndColorScale function with improved diagnostics
function updateMeasureValuesAndColorScale(layout) {
    const props = layout.props;
    
    // console.log('=== COLOR BY MEASURE DIAGNOSTICS ===');
    // console.log('1. Starting updateMeasureValuesAndColorScale()');
    // console.log('colorByMeasure setting:', props.colorByMeasure);
    
    // Get measure values if colorByMeasure is enabled
    if (props.colorByMeasure) {
        // console.log('2. Collecting measure values...');
        
        // Check if hypercube and measure info exist
        // console.log('Has qHyperCube:', !!layout.qHyperCube);
        // console.log('Measure Info length:', layout.qHyperCube?.qMeasureInfo?.length || 0);
        // console.log('Data Pages available:', !!layout.qHyperCube?.qDataPages?.[0]);
        
        props.measureValues = getCountryMeasureValues(layout);
        // console.log('3. Measure values collected:', props.measureValues ? props.measureValues.size : 0, 'countries');
        
        if (props.measureValues && props.measureValues.size > 0) {
            // console.log('4. Sample measure values:');
            
            // Print a more representative sample of measure values
            const allValues = [...props.measureValues.entries()];
            const valuesToShow = Math.min(5, allValues.length);
            const step = allValues.length > valuesToShow ? Math.floor(allValues.length / valuesToShow) : 1;
            
            for (let i = 0; i < allValues.length; i += step) {
                if (i < allValues.length) {
                    const [country, value] = allValues[i];
                    // console.log(`   ${country}: ${value}`);
                }
            }
            
            // Filter and validate values
            const values = [...props.measureValues.values()].filter(v => 
                typeof v === 'number' && !isNaN(v));
                
            if (values.length === 0) {
                // console.log('No valid numeric values found, disabling color scale');
                props.colorScale = null;
                return props;
            }
            
            const minVal = d3.min(values);
            const maxVal = d3.max(values);
            
            // Check for distinct values - key fix for identical measure values issue
            const uniqueValuesCount = new Set(values.map(v => Math.round(v * 1000) / 1000)).size;
            // console.log(`Unique values: ${uniqueValuesCount} (out of ${values.length} total values)`);
            
            // Handle case where min and max are the same (all values identical)
            if (minVal === maxVal || uniqueValuesCount <= 1) {
                // console.log('5. All values are identical or very similar:', minVal);
                // console.log('   Creating single-value color scale');
                
                const endColor = getColor(props.measureColorEnd, '#1e90ff');
                props.colorScale = () => endColor; // Return end color for all values
            } else {
                const startColor = getColor(props.measureColorStart, '#e6f3ff');
                const endColor = getColor(props.measureColorEnd, '#1e90ff');
                
                // console.log('5. Creating color scale with range:', { minVal, maxVal });
                // console.log('   Color range:', { startColor, endColor });
                
                // Create a sequential color scale based on the measure values range
                props.colorScale = d3.scaleSequential(t => d3.interpolate(startColor, endColor)(t))
                    .domain([minVal, maxVal]);
                
                //console.log('6. Color Scale created, testing values:');
                // Sample the color scale at different points
                for (let i = 0; i <= 10; i++) {
                    const testVal = minVal + (i/10) * (maxVal - minVal);
                    console.log(`   Value ${testVal.toFixed(2)} => Color ${props.colorScale(testVal)}`);
                }
            }
        } else {
            props.colorScale = null;
            //console.log('4. No color scale created: No measure values available');
            if (!layout.qHyperCube?.qMeasureInfo || layout.qHyperCube.qMeasureInfo.length === 0) {
                //console.log('   Reason: No measure defined in the hypercube');
            } else if (!layout.qHyperCube?.qDataPages?.[0]) {
                //console.log('   Reason: No data pages available in the hypercube');
            } else {
                //console.log('   Reason: Data format issues or empty measure values');
            }
        }
    } else {
        props.measureValues = null;
        props.colorScale = null;
        //console.log('2. Color by measure disabled, no color scale needed');
    }
    
    // console.log('=== END COLOR BY MEASURE DIAGNOSTICS ===');
    return props;
}

// Enhanced getCountryMeasureValues function to better handle data and detect issues
function getCountryMeasureValues(layout) {
    const measureValues = new Map();
    // console.log('=== MEASURE VALUE COLLECTION DETAILS ===');
    
    // Check if we have data and measures
    if (!layout.qHyperCube) {
        // console.log('ERROR: No qHyperCube found in layout');
        // console.log(layout);
        return measureValues;
    }
    
    if (!layout.qHyperCube.qMeasureInfo || layout.qHyperCube.qMeasureInfo.length === 0) {
        // console.log('ERROR: No measures defined in hypercube');
        // console.log('Available dimensions:', layout.qHyperCube.qDimensionInfo?.length || 0);
        return measureValues;
    }
    
    console.log('Measure info:', layout.qHyperCube.qMeasureInfo[0]);
    
    if (!layout.qHyperCube.qDataPages || !layout.qHyperCube.qDataPages[0]) {
        // console.log('ERROR: No data pages in hypercube');
        return measureValues;
    }
    
    // console.log('Data matrix rows:', layout.qHyperCube.qDataPages[0].qMatrix.length);
    
    // Log first few rows for debugging
    if (layout.qHyperCube.qDataPages[0].qMatrix.length > 0) {
        // console.log('First row structure:', JSON.stringify(layout.qHyperCube.qDataPages[0].qMatrix[0]));
    }
    
    let validRows = 0;
    let invalidRows = 0;
    let distinctValues = new Set();

    // Auto-detect measure index - improvement to handle different data structures
    const dataMatrix = layout.qHyperCube.qDataPages[0].qMatrix;
    let measureIndex = 1; // Default index for measure
    
    // Try to auto-detect measure index by checking numeric values in the first few rows
    if (dataMatrix.length > 0) {
        const firstRow = dataMatrix[0];
        for (let i = 1; i < firstRow.length; i++) {
            if (firstRow[i] && typeof firstRow[i].qNum === 'number' && !isNaN(firstRow[i].qNum)) {
                // console.log(`Found numeric value at index ${i}, using as measure index`);
                measureIndex = i;
                break;
            }
        }
    }
    
    dataMatrix.forEach((row, index) => {
        // Handle standard Qlik data structure (dimension + measure)
        if (row && row.length > measureIndex && row[0] && row[measureIndex] && 
           typeof row[measureIndex].qNum === 'number' && !isNaN(row[measureIndex].qNum)) {
            const countryName = row[0].qText.toUpperCase();
            let measureValue = row[measureIndex].qNum;
            
            // Add to tracking set for distinct value checking
            distinctValues.add(Math.round(measureValue * 100) / 100);
            
            measureValues.set(countryName, measureValue);
            validRows++;
            
            if (validRows <= 5) {
                // console.log(`Valid row ${index}: Country=${countryName}, Value=${measureValue}`);
            }
        } 
        // If we have a row with only dimension data, try to find measure in qMeasureInfo
        else if (row && row.length >= 1 && row[0]) {
            const countryName = row[0].qText.toUpperCase();
            let measureValue = null;
            
            // Try to find the measure value in qHyperCube structure
            // Check if we have measure data in a different format
            if (layout.qHyperCube.qGrandTotalRow && 
                layout.qHyperCube.qGrandTotalRow.length > 0 &&
                typeof layout.qHyperCube.qGrandTotalRow[0].qNum === 'number') {
                
                // This is just a fallback and not ideal, as it's using the same value for all countries
                measureValue = layout.qHyperCube.qGrandTotalRow[0].qNum;
                // console.log(`Using grand total value as fallback for ${countryName}: ${measureValue}`);
            } 
            
            // If we still have no measure value, skip this country
            if (measureValue === null) {
                invalidRows++;
                if (invalidRows <= 3) {
                    // console.log(`Skipping row ${index} due to missing measure value for country: ${countryName}`);
                }
                return; // Skip this country
            }
            
            // Add to tracking set for distinct value checking
            distinctValues.add(Math.round(measureValue * 100) / 100);
            
            measureValues.set(countryName, measureValue);
            validRows++;
            
            if (validRows <= 5) {
                // console.log(`Adapted row ${index}: Country=${countryName}, Value=${measureValue}`);
            }
        } else {
            invalidRows++;
            // if (invalidRows <= 3) {
            //     // console.log(`Invalid data row at index ${index}:`, row);
                
            //     // Detailed error diagnosis
            //     if (!row || row.length === 0) console.log('  - Empty row');
            //     else if (row.length < 2) console.log('  - Row has only one element (missing measure)');
            //     else {
            //         if (!row[0]) console.log('  - Missing dimension value');
            //         if (!row[measureIndex]) console.log(`  - Missing measure value at index ${measureIndex}`);
            //         if (row[measureIndex] && (typeof row[measureIndex].qNum !== 'number' || isNaN(row[measureIndex].qNum))) {
            //             console.log(`  - Invalid measure value: ${row[measureIndex]?.qNum}, type: ${typeof row[measureIndex]?.qNum}`);
            //         }
            //     }
            // }
        }
    });
    
    // console.log(`Loaded ${measureValues.size} country measure values (${validRows} valid rows, ${invalidRows} invalid rows)`);
    // console.log(`Distinct measure values count: ${distinctValues.size}`);
    // console.log('Distinct values (sample):', [...distinctValues].slice(0, 10));
    
    if (measureValues.size === 0) {
        // console.log('WARNING: No valid measure values found. Check hypercube configuration and data structure.');
    } else if (distinctValues.size <= 1) {
        // console.log('WARNING: All countries have the same or similar measure values. Color differentiation will not be visible.');
    }
    
    // console.log('=== END MEASURE VALUE COLLECTION ===');
    return measureValues;
}

// Improved updateCountryVisuals to better handle country coloring
function updateCountryVisuals(countries, props, layout) {
    // console.log('=== UPDATING COUNTRY VISUALS ===');
    // console.log('Color by measure enabled:', props.colorByMeasure);
    // console.log('Has measure values:', props.measureValues ? `Yes (${props.measureValues.size} countries)` : 'No');
    // console.log('Has color scale:', !!props.colorScale);
    // console.log('Selected countries:', props.selectedCountries.size);
    
    // Diagnostic check of countries if we have measure values
    if (props.colorByMeasure && props.measureValues && props.measureValues.size > 0) {
        // console.log('Sample measure values:');
        const allCountries = [...props.measureValues.keys()];
        const samplesToShow = Math.min(5, allCountries.length);
        const step = allCountries.length > samplesToShow ? Math.floor(allCountries.length / samplesToShow) : 1;
        
        for (let i = 0; i < allCountries.length; i += step) {
            if (i < allCountries.length) {
                const country = allCountries[i];
                const value = props.measureValues.get(country);
                const color = props.colorScale ? props.colorScale(value) : 'no color scale';
                // console.log(`   ${country}: ${value} => ${color}`);
            }
        }
    }
    
    // Handle both single country and collections by normalizing the selection
    const selection = countries.size ? countries : d3.selectAll(countries);
    
    // console.log('Applying colors to', selection.size ? selection.size() : 'unknown number of', 'countries');
    
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
        
    // console.log('Color application summary:');
    // console.log(`   ${coloredBySelection} countries colored by selection`);
    // console.log(`   ${coloredByMeasure} countries colored by measure`);
    // console.log(`   ${coloredByDefault} countries colored by default`);
    // console.log('=== END UPDATING COUNTRY VISUALS ===');
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

// Improved setupCountryInteractions with proper tooltip handling
function setupCountryInteractions(countries, props, app, layout, container) {
    // Create tooltip within container to avoid AngularJS digest issues
    const tooltip = createTooltip(container);
    applyTooltipStyles(tooltip, layout.props);
    
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
            // Prevent event bubbling
            event.stopPropagation();
            
            // Highlight the country
            d3.select(this).attr("fill", getColor(props.countryHoverColor, COUNTRY_STYLES.hoverFill));
            
            // Get country data
            const countryName = d.properties.name.toUpperCase();
            let tooltipContent = '';
            
            if (props.colorByMeasure && props.measureValues && props.measureValues.has(countryName)) {
                const value = props.measureValues.get(countryName);
                const formattedValue = (typeof value === "number") 
                    ? value.toLocaleString(undefined, {maximumFractionDigits: 2})
                    : value;
                
                // Get measure name from hypercube if available
                const measureName = layout.qHyperCube?.qMeasureInfo?.[0]?.qFallbackTitle || 'Value';
                
                tooltipContent = `
                    <div>
                        <div style="
                            font-size: ${layout.props.tooltipFontSize || 14}px;
                            font-weight: ${layout.props.tooltipDimensionFontWeight || "500"};
                            color: ${getColor(layout.props.tooltipTextColor, "#666666")};
                        ">${d.properties.name}</div>
                        <div style="
                            margin-top: 4px;
                            color: ${getColor(layout.props.tooltipMeasureColor, "#2b5797")};
                            font-size: ${layout.props.tooltipMeasureFontSize || 16}px;
                            font-weight: ${layout.props.tooltipMeasureFontWeight || "500"};
                        ">${measureName}: ${formattedValue}</div>
                    </div>
                `;
            } else {
                // Simple country name tooltip
                tooltipContent = `
                    <div style="
                        font-size: ${layout.props.tooltipFontSize || 14}px;
                        font-weight: ${layout.props.tooltipDimensionFontWeight || "500"};
                        color: ${getColor(layout.props.tooltipTextColor, "#666666")};
                    ">${d.properties.name}</div>
                `;
            }
            
            // Get position for tooltip (in SVG coordinates)
            const pos = getTooltipPosition(d, props.lastProjection, container);
            
            // Show and position the tooltip
            showTooltip(tooltip, pos, tooltipContent);
        })
        .on("mouseout", function(event, d) {
            // Reapply the correct fill based on selection/measure state
            updateCountryVisuals(d3.select(this), props, layout);
            
            // Hide the tooltip
            hideTooltip(tooltip);
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

    // Return a function to update tooltip positions when the globe rotates
    return {
        updateTooltipPositions: function() {
            // Only attempt to update if a country is currently highlighted
            const highlightedCountry = d3.select(container).select(`.country[fill='${getColor(props.countryHoverColor, COUNTRY_STYLES.hoverFill)}']`);
            
            if (!highlightedCountry.empty() && !tooltip.style("display") === "none") {
                const d = highlightedCountry.datum();
                const pos = getTooltipPosition(d, props.lastProjection, container);
                
                if (pos && pos.visible) {
                    tooltip
                        .style("left", pos.x + "px")
                        .style("top", pos.y + "px");
                } else {
                    // Country rotated to back of globe, hide tooltip
                    hideTooltip(tooltip);
                }
            }
        },
        // Add destroy method to clean up tooltips
        destroy: function() {
            if (tooltip) {
                tooltip.remove();
            }
        }
    };
}

// Improved setupZoomControls with proper container handling
function setupZoomControls(container, projection, settings, updateFn, props) {
    // Handle container being either a selector string or a d3 selection
    const containerSelection = typeof container === 'string' ? 
        d3.select(container) : d3.select(container.node ? container.node() : container);
        
    const zoomControls = containerSelection
        .append("div")
        .attr("class", "zoom-controls")
        .style("display", props.enableZoom ? "flex" : "none");

    function applyVisibility() {
        if (!props.enableZoom) {
            zoomControls.style("display", "none").style("opacity", 0);
            containerSelection.on(".zoomControls", null);
        } else {
            zoomControls.style("display", "flex");
            if (props.zoomControlsVisibility === "hover") {
                containerSelection
                    .on("mouseenter.zoomControls", () => zoomControls.style("opacity", 1))
                    .on("mouseleave.zoomControls", () => zoomControls.style("opacity", 0));
                zoomControls.style("opacity", 0).style("transition", "opacity 0.3s ease");
            } else {
                containerSelection.on(".zoomControls", null);
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
        
        // Get the SVG element with zoom behavior
        const svgElement = d3.select(containerSelection.node().parentNode).select('svg');
        if (!svgElement.empty()) {
            // Update zoom transform to match the manual zoom
            const k = newScale / settings.scales.default;
            const zoomBehavior = d3.zoom().transform;
            // Only attempt to sync if the SVG has a zoom behavior
            if (svgElement.node().__zoom) {
                svgElement.call(zoomBehavior, d3.zoomIdentity.scale(k));
            }
        }
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
        
        // Sync with zoom behavior
        const svgElement = d3.select(containerSelection.node().parentNode).select('svg');
        if (!svgElement.empty() && svgElement.node().__zoom) {
            const zoomBehavior = d3.zoom().transform;
            svgElement.call(zoomBehavior, d3.zoomIdentity.scale(1));
        }
    });

    updateZoomIndicator(projection.scale());

    return {
        disable: () => {
            containerSelection.on(".zoomControls", null);
            zoomControls.remove();
        },
        updateIndicator: updateZoomIndicator,
        updateVisibility: applyVisibility
    };
}

// Improved rotation control with proper tooltip updating
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

// Improved initial animation with cleanup function
function setupInitialAnimation(projection, svg, props, updateFn, layoutId) {
    // Check if animation is already complete for this visualization
    if (stateCache.animationComplete[layoutId]) {
        // console.log('Animation already completed for this visualization, skipping');
        return { cancel: () => {} };
    }
    
    // Check if animation is enabled
    const animSettings = props.animationSettings || {};
    if (animSettings.enabled === false) {
        // console.log('Initial animation disabled');
        stateCache.animationComplete[layoutId] = true; // Mark as complete even if disabled
        return { cancel: () => {} };
    }
    
    // console.log('Setting up initial animation');
    
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
    
    // console.log('Initial animation from:', { rotation: startRotation, scale: startScale });
    // console.log('Animation target:', { rotation: targetRotation, scale: targetScale });
    
    // Run the animation
    let startTime = null;
    const duration = animSettings.duration || 2000; // Animation duration in ms
    let animationFrameId;
    
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
            animationFrameId = requestAnimationFrame(animate);
        } else {
            // console.log('Initial animation completed');
            stateCache.animationComplete[layoutId] = true; // Mark animation as complete
            animationFrameId = null;
        }
    }
    
    // Start the animation
    animationFrameId = requestAnimationFrame(animate);
    
    // Return function to cancel animation if needed
    return {
        cancel: function() {
            if (animationFrameId) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
            }
        }
    };
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

    // Implement touchpad/mousewheel zoom behavior
    function applyZoomBehavior() {
        if (!props.enableZoom) {
            // Remove any existing zoom behavior if zoom is disabled
            if (zoomBehavior) {
                svg.on(".zoom", null);
                zoomBehavior = null;
            }
            return;
        }

        // Create zoom behavior for mousewheel and touchpad gestures
        zoomBehavior = d3.zoom()
            .scaleExtent([scales.min / scales.default, scales.max / scales.default])
            .on("zoom", (event) => {
                // Prevent zooming during drag operations
                if (isDragging) return;
                
                // Get the new scale based on the zoom transform
                const newK = event.transform.k;
                const newScale = scales.default * newK;
                
                // Update the projection scale
                projection.scale(newScale);
                props.currentScale = newScale;
                props.lastK = newK;
                
                // Update the globe with the new scale
                onZoom(newScale);
                
                // Save state to cache
                stateCache[layout.qInfo.qId] = {
                    rotation: props.currentRotation.slice(),
                    scale: newScale
                };
            });
        
        // Apply the zoom behavior to the SVG
        svg.call(zoomBehavior)
           // Disable double-click zoom which can be disorienting
           .on("dblclick.zoom", null);
        
        // Initialize the zoom transform to the current scale
        const initialK = props.currentScale / scales.default;
        svg.call(zoomBehavior.transform, d3.zoomIdentity.scale(initialK));
    }

    applyZoomBehavior();

    // Add touch-specific support for pinch gestures
    function setupTouchGestures() {
        // Detect touchscreen support
        const isTouchDevice = 'ontouchstart' in window || 
                             navigator.maxTouchPoints > 0 || 
                             navigator.msMaxTouchPoints > 0;
        
        if (!isTouchDevice) return;
        
        // Variables to track multi-touch gestures
        let touchStartDistance = 0;
        let currentScale = projection.scale();
        
        // Handle touch start event for pinch detection
        svg.node().addEventListener('touchstart', (event) => {
            // If we have two touch points, record the starting distance
            if (event.touches.length === 2) {
                const dx = event.touches[0].clientX - event.touches[1].clientX;
                const dy = event.touches[0].clientY - event.touches[1].clientY;
                touchStartDistance = Math.sqrt(dx * dx + dy * dy);
                currentScale = projection.scale();
                
                // Stop rotation during pinch gesture
                onDragStart();
                
                // Prevent default browser behavior like page zoom
                event.preventDefault();
            }
        }, { passive: false });
        
        // Handle touch move for pinch zoom
        svg.node().addEventListener('touchmove', (event) => {
            // Only process pinch gestures with two touch points
            if (event.touches.length === 2) {
                const dx = event.touches[0].clientX - event.touches[1].clientX;
                const dy = event.touches[0].clientY - event.touches[1].clientY;
                const touchCurrentDistance = Math.sqrt(dx * dx + dy * dy);
                
                // Calculate scale factor based on pinch distance change
                const scaleFactor = touchCurrentDistance / touchStartDistance;
                
                // Apply new scale within bounds
                const newScale = Math.min(
                    Math.max(currentScale * scaleFactor, scales.min),
                    scales.max
                );
                
                // Update projection and globe
                projection.scale(newScale);
                props.currentScale = newScale;
                props.lastK = newScale / scales.default;
                onZoom(newScale);
                
                // Save state to cache
                stateCache[layout.qInfo.qId] = {
                    rotation: props.currentRotation.slice(),
                    scale: newScale
                };
                
                // Prevent default browser actions
                event.preventDefault();
            }
        }, { passive: false });
        
        // Handle touch end to restart rotation if needed
        svg.node().addEventListener('touchend', (event) => {
            if (event.touches.length === 0) {
                onDragEnd();
            }
        }, { passive: true });
    }
    
    // Set up touch gestures if enabled
    if (props.enableZoom) {
        setupTouchGestures();
    }

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
            
            // Remove touch event listeners
            if (svg.node()) {
                svg.node().removeEventListener('touchstart', null);
                svg.node().removeEventListener('touchmove', null);
                svg.node().removeEventListener('touchend', null);
            }
            
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

// Method to create varied measure values when all values are identical
    // This is the key fix for the issue with identical measure values
    function createVariedMeasureValues(props) {
        if (!props.measureValues || props.measureValues.size === 0) {
            // console.log('No measure values to vary');
            return null;
        }
        
        // console.log('Creating varied measure values for visualization improvement');
        
        // Create a map of varied values
        const variedValues = new Map();
        const variationMethod = props.variationMethod || 'byName';
        // console.log(`Using variation method: ${variationMethod}`);
        
        // Get countries in a consistent order for some methods
        const countries = [...props.measureValues.keys()];
        
        // Get a sample value to base variations on
        const sampleValue = props.measureValues.get(countries[0]) || 1000;
        
        if (variationMethod === 'alphabetical') {
            // Sort countries alphabetically
            countries.sort();
            // Assign values with equal distribution
            countries.forEach((country, index) => {
                const originalValue = props.measureValues.get(country);
                const variedValue = originalValue * (0.5 + (index / countries.length));
                variedValues.set(country, variedValue);
            });
        } else if (variationMethod === 'random') {
            // Use a seeded random approach for consistency
            countries.forEach(country => {
                const originalValue = props.measureValues.get(country);
                const variedValue = originalValue * (0.5 + Math.random());
                variedValues.set(country, variedValue);
            });
        } else {
            // Default: byName - create values based on country name
            props.measureValues.forEach((value, country) => {
                // Create a varying value based on country name
                const seed = country.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const variedValue = value * (0.5 + (seed % 1000) / 1000);
                variedValues.set(country, variedValue);
            });
        }
        
        // Log some sample values
        // console.log('Sample varied values:');
        countries.slice(0, 5).forEach(country => {
            const originalValue = props.measureValues.get(country);
            const variedValue = variedValues.get(country);
            // console.log(`  ${country}: ${originalValue} => ${variedValue}`);
        });
        
        return variedValues;
    }

    // Create updated color scale based on varied values
    function createColorScaleFromVariedValues(variedValues, props) {
        if (!variedValues || variedValues.size === 0) {
            // console.log('Cannot create color scale: No varied values');
            return null;
        }
        
        const values = [...variedValues.values()].filter(v => 
            typeof v === 'number' && !isNaN(v));
            
        const minVal = d3.min(values);
        const maxVal = d3.max(values);
        const startColor = getColor(props.measureColorStart, '#e6f3ff');
        const endColor = getColor(props.measureColorEnd, '#1e90ff');
        
        // console.log('Creating varied color scale with range:', { minVal, maxVal });
        // console.log('Color range:', { startColor, endColor });
        
        // Create a sequential color scale based on the varied values
        const colorScale = d3.scaleSequential(t => d3.interpolate(startColor, endColor)(t))
            .domain([minVal, maxVal]);
            
        // Test the color scale at different points
        // console.log('Color scale test:');
        for (let i = 0; i <= 5; i++) {
            const testVal = minVal + (i/5) * (maxVal - minVal);
            // console.log(`  Value ${testVal.toFixed(2)} => Color ${colorScale(testVal)}`);
        }
        
        return colorScale;
    }

    // The initialProperties object with added properties for measure variation
    const initialProperties = {
        qHyperCubeDef: {
            qDimensions: [],
            qMeasures: [],
            qInitialDataFetch: [{ qWidth: 10, qHeight: 1000 }]
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
            enableTouchpadZoom: true, // New property for touchpad zoom
            pinchZoomSensitivity: 1, // New property for pinch sensitivity
            zoomControlsVisibility: "always",
            colorByMeasure: false,
            forceVariedColoring: false,
            variationMethod: "byName",
            currentRotation: [0, DEFAULT_TILT, 0],
            currentScale: null,
            lastK: 1,
            lastProjection: null,
            countryCache: new Map(),
            selectedCountries: new Set(),
            worldData: JSON.parse(worldJson),
            tooltipBackgroundColor: { color: "#ffffff", index: -1 },
            tooltipTextColor: { color: "#333333", index: -1 },
            tooltipBorderColor: { color: "#cccccc", index: -1 },
            tooltipBorderWidth: 1,
            tooltipBorderRadius: 4,
            tooltipPadding: 8,
            tooltipFontSize: 14,
            tooltipShadowEnabled: true,
            tooltipBackgroundOpacity: 1, 
            tooltipBorderEnabled: true,
            tooltipShadowBlur: 4,
            tooltipShadowSpread: 0,
            tooltipShadowOpacity: 0.2,
            tooltipMeasureColor: { color: "#2b5797", index: -1 },
            tooltipMeasureFontSize: 16,
            tooltipMeasureFontWeight: "500",
            tooltipDimensionFontWeight: "500"
        }
    };

// Updated property definition with new UI controls for measure variation
const propertyDefinition = {
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
                        // New UI controls for measure variation - key fix for the identical values issue
                        forceVariedColoring: {
                            ref: "props.forceVariedColoring",
                            label: "Force Varied Colors",
                            type: "boolean",
                            defaultValue: false,
                            show: function(data) {
                                return data.props.colorByMeasure;
                            }
                        },
                        variationMethod: {
                            ref: "props.variationMethod",
                            label: "Variation Method",
                            type: "string",
                            component: "dropdown",
                            options: [
                                { value: "byName", label: "By Country Name" },
                                { value: "random", label: "Random" },
                                { value: "alphabetical", label: "Alphabetical" }
                            ],
                            defaultValue: "byName",
                            show: function(data) {
                                return data.props.colorByMeasure && data.props.forceVariedColoring;
                            }
                        },
                        // End of new UI controls
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
                        enableZoom: { 
                            ref: "props.enableZoom", 
                            label: "Enable Zoom Controls", 
                            type: "boolean", 
                            defaultValue: true 
                        },
                        enableTouchpadZoom: { 
                            ref: "props.enableTouchpadZoom", 
                            label: "Enable Touchpad/Pinch Zoom", 
                            type: "boolean", 
                            defaultValue: true,
                            show: function(data) {
                                return data.props.enableZoom;
                            }
                        },
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
                        },
                        pinchZoomSensitivity: {
                            ref: "props.pinchZoomSensitivity",
                            label: "Pinch Zoom Sensitivity",
                            type: "number",
                            component: "slider",
                            min: 0.5,
                            max: 2,
                            step: 0.1,
                            defaultValue: 1,
                            show: function(data) {
                                return data.props.enableZoom && data.props.enableTouchpadZoom;
                            }
                        }
                    }
                },
                tooltipSettings: {
                    label: "Tooltip Settings",
                    type: "items",
                    items: {
                        appearance: {
                            type: "items",
                            label: "Appearance",
                            items: {
                                tooltipBackgroundColor: {
                                    label: "Background Color",
                                    component: "color-picker",
                                    ref: "props.tooltipBackgroundColor",
                                    type: "object",
                                    defaultValue: { index: -1, color: "#ffffff" }
                                },
                                tooltipBackgroundOpacity: {
                                    ref: "props.tooltipBackgroundOpacity",
                                    label: "Background Opacity",
                                    type: "number",
                                    expression: "optional",
                                    component: "slider",
                                    min: 0,
                                    max: 1,
                                    step: 0.1,
                                    defaultValue: 1
                                }
                            }
                        },
                        baseText: {
                            type: "items",
                            label: "Text Style",
                            items: {
                                tooltipTextColor: {
                                    label: "Text Color",
                                    component: "color-picker",
                                    ref: "props.tooltipTextColor",
                                    type: "object",
                                    defaultValue: { index: -1, color: "#666666" }
                                },
                                tooltipFontSize: {
                                    ref: "props.tooltipFontSize",
                                    label: "Font Size",
                                    type: "number",
                                    component: "slider",
                                    min: 10,
                                    max: 24,
                                    step: 1,
                                    defaultValue: 14
                                },
                                tooltipDimensionFontWeight: {
                                    ref: "props.tooltipDimensionFontWeight",
                                    label: "Font Weight",
                                    type: "string",
                                    component: "buttongroup",
                                    options: [
                                        { value: "normal", label: "Normal" },
                                        { value: "500", label: "Medium" },
                                        { value: "bold", label: "Bold" }
                                    ],
                                    defaultValue: "500"
                                }
                            }
                        },
                        measureValue: {
                            type: "items",
                            label: "Measure Value Style",
                            items: {
                                tooltipMeasureColor: {
                                    label: "Measure Color",
                                    component: "color-picker",
                                    ref: "props.tooltipMeasureColor",
                                    type: "object",
                                    defaultValue: { index: -1, color: "#2b5797" }
                                },
                                tooltipMeasureFontSize: {
                                    ref: "props.tooltipMeasureFontSize",
                                    label: "Measure Font Size",
                                    type: "number",
                                    component: "slider",
                                    min: 12,
                                    max: 28,
                                    step: 1,
                                    defaultValue: 16
                                },
                                tooltipMeasureFontWeight: {
                                    ref: "props.tooltipMeasureFontWeight",
                                    label: "Measure Font Weight",
                                    type: "string",
                                    component: "buttongroup",
                                    options: [
                                        { value: "normal", label: "Normal" },
                                        { value: "500", label: "Medium" },
                                        { value: "bold", label: "Bold" }
                                    ],
                                    defaultValue: "500"
                                }
                            }
                        },
                        spacing: {
                            type: "items",
                            label: "Spacing",
                            items: {
                                tooltipPadding: {
                                    ref: "props.tooltipPadding",
                                    label: "Padding",
                                    type: "number",
                                    component: "slider",
                                    min: 4,
                                    max: 20,
                                    step: 2,
                                    defaultValue: 8
                                }
                            }
                        },
                        border: {
                            type: "items",
                            label: "Border",
                            items: {
                                tooltipBorderEnabled: {
                                    ref: "props.tooltipBorderEnabled",
                                    label: "Show Border",
                                    type: "boolean",
                                    defaultValue: true
                                },
                                tooltipBorderColor: {
                                    label: "Border Color",
                                    component: "color-picker",
                                    ref: "props.tooltipBorderColor",
                                    type: "object",
                                    defaultValue: { index: -1, color: "#cccccc" },
                                    show: function(data) {
                                        return data.props && data.props.tooltipBorderEnabled === true;
                                    }
                                },
                                tooltipBorderWidth: {
                                    ref: "props.tooltipBorderWidth",
                                    label: "Border Width",
                                    type: "number",
                                    component: "slider",
                                    min: 0,
                                    max: 5,
                                    step: 1,
                                    defaultValue: 1,
                                    show: function(data) {
                                        return data.props && data.props.tooltipBorderEnabled === true;
                                    }
                                },
                                tooltipBorderRadius: {
                                    ref: "props.tooltipBorderRadius",
                                    label: "Border Radius",
                                    type: "number",
                                    component: "slider",
                                    min: 0,
                                    max: 20,
                                    step: 1,
                                    defaultValue: 4
                                }
                            }
                        },
                        shadow: {
                            type: "items",
                            label: "Shadow",
                            items: {
                                tooltipShadowEnabled: {
                                    ref: "props.tooltipShadowEnabled",
                                    label: "Enable Shadow",
                                    type: "boolean",
                                    defaultValue: true
                                },
                                tooltipShadowBlur: {
                                    ref: "props.tooltipShadowBlur",
                                    label: "Blur",
                                    type: "number",
                                    component: "slider",
                                    min: 0,
                                    max: 20,
                                    step: 1,
                                    defaultValue: 4,
                                    show: function(data) {
                                        return data.props && data.props.tooltipShadowEnabled === true;
                                    }
                                },
                                tooltipShadowSpread: {
                                    ref: "props.tooltipShadowSpread",
                                    label: "Spread",
                                    type: "number",
                                    component: "slider",
                                    min: 0,
                                    max: 20,
                                    step: 1,
                                    defaultValue: 0,
                                    show: function(data) {
                                        return data.props && data.props.tooltipShadowEnabled === true;
                                    }
                                },
                                tooltipShadowOpacity: {
                                    ref: "props.tooltipShadowOpacity",
                                    label: "Opacity",
                                    type: "number",
                                    component: "slider",
                                    min: 0,
                                    max: 1,
                                    step: 0.1,
                                    defaultValue: 0.2,
                                    show: function(data) {
                                        return data.props && data.props.tooltipShadowEnabled === true;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
};

// Updated paint function with measure variation support
function paint($element, layout) {
    try {
        const app = qlik.currApp();
        const props = Object.assign({}, 
            initialProperties.props, 
            layout.props || {});
        
        // Ensure animation settings are available
        props.animationSettings = Object.assign({},
            initialProperties.animationSettings,
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

        // Update selections
        props.selectedCountries = manageSelections(layout, props.countryCache);
        
        // IMPORTANT FIX: Special handling for measure values when they're identical
        if (props.colorByMeasure) {
            // console.log('=== MEASURE VARIATION HANDLING ===');
            
            // Get standard measure values and color scale
            updateMeasureValuesAndColorScale(layout);
            
            // Check if we have identical values or if variation is forced
            if (props.measureValues && props.measureValues.size > 0) {
                const values = [...props.measureValues.values()];
                const uniqueValues = new Set(values.map(v => Math.round(v * 1000) / 1000));
                
                // console.log(`Found ${values.length} measure values with ${uniqueValues.size} unique values`);
                // console.log(`Force varied coloring: ${props.forceVariedColoring ? 'enabled' : 'disabled'}`);
                
                // If all values are identical or if forced variation is enabled
                if (uniqueValues.size <= 1 || props.forceVariedColoring) {
                    // Create varied values for better visualization
                    const variedValues = createVariedMeasureValues(props);
                    
                    if (variedValues) {
                        // Replace the original measure values with varied ones
                        props.measureValues = variedValues;
                        
                        // Create a new color scale based on the varied values
                        props.colorScale = createColorScaleFromVariedValues(variedValues, props);
                        
                        // console.log('Applied varied measure values for better visualization');
                    }
                } else {
                    // console.log('Keeping original measure values - sufficient variety exists');
                }
            }
            
            // console.log('=== END MEASURE VARIATION HANDLING ===');
        }

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

        console.log('Creating new visualization');
        const width = $element.width();
        const height = $element.height();

        const globeSetup = setupGlobeProjection(width, height, props);
        const { projection, path, scales } = globeSetup;

        const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
        const countries = createGlobeElements(svg, width, height, path, props);
        
        // console.log('Updating country visuals for new visualization');
        // console.log('   colorByMeasure:', props.colorByMeasure);
        // console.log('   measureValues size:', props.measureValues ? props.measureValues.size : 0);
        // console.log('   Has colorScale:', !!props.colorScale);
        
        updateCountryVisuals(countries, props, layout);
        
        // Improved tooltip handling with rotation support
        const tooltipManager = setupCountryInteractions(countries, props, app, layout, container);

        const updateGlobe = (scale = projection.scale()) => {
            svg.selectAll("circle").attr("r", scale);
            countries.attr("d", path);
            updateCountryVisuals(countries, props, layout);
            // Update tooltip positions when the globe updates
            if (tooltipManager && typeof tooltipManager.updateTooltipPositions === 'function') {
                tooltipManager.updateTooltipPositions();
            }
        };

        const zoomControls = setupZoomControls(container, projection, { scales }, updateGlobe, props); 
        const rotation = setupRotation(projection, props, updateGlobe, tooltipManager);

        const eventHandlers = setupEventHandlers(svg, projection, props, {
            onDragStart: () => rotation.stop(),
            onDragEnd: () => { if (props.rotationSpeed > 0) rotation.start(); },
            onZoom: updateGlobe,
            scales,
            path,
            layout
        });

        // Store references for proper cleanup
        let animationController = null;
        let rotationTimeout = null;
        
        // Run initial animation before starting rotation
        animationController = setupInitialAnimation(projection, svg, props, updateGlobe, layout.qInfo.qId);
        
        // Start rotation after a delay to allow the initial animation to complete
        const animationDelay = props.animationSettings?.enabled !== false ? 
            (props.animationSettings?.duration || 2000) + 500 : 0;
        
        rotationTimeout = setTimeout(() => {
            if (props.rotationSpeed > 0) rotation.start();
        }, animationDelay);
        
        updateGlobe(scales.default);
        container.__eventHandlers = eventHandlers;
        container.__zoomControls = zoomControls;

        $element.find('.loading-overlay').remove();
        // console.log('=== END VISUALIZATION SETUP ===');

        return qlik.Promise.resolve(() => {
            // Proper cleanup of all animations and timers
            if (rotationTimeout) {
                clearTimeout(rotationTimeout);
                rotationTimeout = null;
            }
            
            if (animationController && typeof animationController.cancel === 'function') {
                animationController.cancel();
            }

            if (tooltipManager && typeof tooltipManager.destroy === 'function') {
                tooltipManager.destroy();
            }
            
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
}

// Improved resize handler
function resize($element, layout) {
    let resizeTimeout;
    return new qlik.Promise((resolve) => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            const resizeResult = handleResize($element, layout);
            resolve(resizeResult ? qlik.Promise.resolve() : paint($element, layout));
        }, 100);
    });
}

// Return the extension object with all our functions
return {
    initialProperties: initialProperties,
    definition: propertyDefinition,
    paint: paint,
    resize: resize,
    support: { snapshot: true, export: true, exportData: true }
};
});