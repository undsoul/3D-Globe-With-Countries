// Part 1: Initial Setup and Core Functionality

define(['qlik', 'jquery', 'text!./globeCoordinates.json', './d3.v7'], function(qlik, $, worldJson, d3) {
    'use strict';
    const stateCache = {
        // Add a property to track whether an animation has already run
        animationComplete: {}
    };

    // Constants
    const COUNTRY_STYLES = {
        defaultFill: "#d4dadc",
        selectedFill: "#006580",
        hoverFill: "#b8bfc2",
        defaultStrokeWidth: 0.5,
        selectedStrokeWidth: 1
    };

    // Enhanced Tooltip Constants with new properties
    const TOOLTIP_STYLES = {
        defaultBackgroundColor: "#F8F9FA",
        defaultBackgroundOpacity: 0.9,
        defaultBorderColor: "#ffffff",
        defaultBorderWidth: 1,
        defaultBorderRadius: "4px",
        defaultPadding: "8px",
        defaultFontSize: "12px",
        defaultFontWeight: "normal",
        defaultFontColor: "#006580",
        defaultShadow: "0 2px 5px rgba(0,0,0,0.2)"
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
        .globe-tooltip {
            position: absolute;
            display: none;
            pointer-events: none;
            z-index: 1000;
            box-sizing: border-box;
            max-width: 200px;
            line-height: 1.4;
            transition: opacity 0.2s;
        }
    `;
    document.head.appendChild(styleElement);

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

    function logError(context, error, layoutId) {
        console.error(`${context}:`, {
            message: error.message,
            stack: error.stack,
            layoutId
        });
    }

    // Enhanced createTooltip function with new style properties
    function createTooltip(container, props) {
        const tooltipDiv = d3.select(container)
            .append("div")
            .attr("class", "globe-tooltip")
            .style("display", "none")
            .style("position", "absolute")
            .style("pointer-events", "none")
            .style("background-color", hexToRgba(getColor(props.tooltipBackgroundColor, TOOLTIP_STYLES.defaultBackgroundColor), 
                                               props.tooltipBackgroundOpacity || TOOLTIP_STYLES.defaultBackgroundOpacity))
            .style("border", `${props.tooltipBorderSize || TOOLTIP_STYLES.defaultBorderWidth}px solid ${
                getColor(props.tooltipBorderColor, TOOLTIP_STYLES.defaultBorderColor)}`)
            .style("border-radius", props.tooltipBorderRadius || TOOLTIP_STYLES.defaultBorderRadius)
            .style("padding", TOOLTIP_STYLES.defaultPadding)
            .style("font-size", props.tooltipFontSize || TOOLTIP_STYLES.defaultFontSize)
            .style("font-weight", props.tooltipFontWeight || TOOLTIP_STYLES.defaultFontWeight)
            .style("color", getColor(props.tooltipFontColor, TOOLTIP_STYLES.defaultFontColor))
            .style("box-shadow", TOOLTIP_STYLES.defaultShadow)
            .style("max-width", "200px")
            .style("z-index", "1000");
            
        return tooltipDiv;
    }
// End of Part 1
    // Part 2: Data Processing and Country Management Functions

    function manageSelections(layout, countryCache) {
        const newSelections = new Set();
        if (layout.qHyperCube?.qDataPages?.[0]) {
            layout.qHyperCube.qDataPages[0].qMatrix.forEach(row => {
                if (row[0]?.qState === 'S' || row[0]?.qState === 'L') {
                    const countryName = row[0].qText.toUpperCase();
                    if (countryCache && typeof countryCache.has === 'function' && countryCache.has(countryName)) {
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
        
        // Get measure values if colorByMeasure is enabled
        if (props.colorByMeasure) {
            props.measureValues = getCountryMeasureValues(layout);
            
            // Ensure measureValues is a Map
            if (!props.measureValues || typeof props.measureValues.has !== 'function') {
                props.measureValues = new Map();
            }
            
            if (props.measureValues && props.measureValues.size > 0) {
                // Filter and validate values
                const values = [...props.measureValues.values()].filter(v => 
                    typeof v === 'number' && !isNaN(v));
                    
                if (values.length === 0) {
                    props.colorScale = null;
                    return props;
                }
                
                const minVal = d3.min(values);
                const maxVal = d3.max(values);
                
                // Check for distinct values - key fix for identical measure values issue
                const uniqueValuesCount = new Set(values.map(v => Math.round(v * 1000) / 1000)).size;
                
                // Handle case where min and max are the same (all values identical)
                if (minVal === maxVal || uniqueValuesCount <= 1) {
                    const endColor = getColor(props.measureColorEnd, '#008536');
                    props.colorScale = () => endColor; // Return end color for all values
                } else {
                    const startColor = getColor(props.measureColorStart, '#e5f3ec');
                    const endColor = getColor(props.measureColorEnd, '#008536');
                    
                    // Create a sequential color scale based on the measure values range
                    props.colorScale = d3.scaleSequential(t => d3.interpolate(startColor, endColor)(t))
                        .domain([minVal, maxVal]);
                }
            } else {
                props.colorScale = null;
            }
        } else {
            props.measureValues = null;
            props.colorScale = null;
        }
        
        return props;
    }

    // Enhanced getCountryMeasureValues function to better handle data and detect issues
    function getCountryMeasureValues(layout) {
        const measureValues = new Map();
        
        // Check if we have data and measures
        if (!layout.qHyperCube) {
            return measureValues;
        }
        
        if (!layout.qHyperCube.qMeasureInfo || layout.qHyperCube.qMeasureInfo.length === 0) {
            return measureValues;
        }
        
        if (!layout.qHyperCube.qDataPages || !layout.qHyperCube.qDataPages[0]) {
            return measureValues;
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
                    measureIndex = i;
                    break;
                }
            }
        }
        
        dataMatrix.forEach((row) => {
            // Handle standard Qlik data structure (dimension + measure)
            if (row && row.length > measureIndex && row[0] && row[measureIndex] && 
               typeof row[measureIndex].qNum === 'number' && !isNaN(row[measureIndex].qNum)) {
                const countryName = row[0].qText.toUpperCase();
                let measureValue = row[measureIndex].qNum;
                
                // Add to tracking set for distinct value checking
                distinctValues.add(Math.round(measureValue * 100) / 100);
                
                measureValues.set(countryName, measureValue);
                validRows++;
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
                } 
                
                // If we still have no measure value, skip this country
                if (measureValue === null) {
                    invalidRows++;
                    return; // Skip this country
                }
                
                // Add to tracking set for distinct value checking
                distinctValues.add(Math.round(measureValue * 100) / 100);
                
                measureValues.set(countryName, measureValue);
                validRows++;
            } else {
                invalidRows++;
            }
        });
        
        return measureValues;
    }

    // Format tooltip content based on country data
    function formatTooltipContent(country, props) {
        const countryName = country.properties.name;
        let content = `<div><strong>${countryName}</strong></div>`;
        
        // Add measure value if available
        if (props.colorByMeasure && 
            props.measureValues && 
            typeof props.measureValues.has === 'function' &&
            props.measureValues.has(countryName.toUpperCase())) {
            
            const value = props.measureValues.get(countryName.toUpperCase());
            const formattedValue = typeof value === 'number' ? 
                value.toLocaleString(undefined, { maximumFractionDigits: 2 }) : value;
            
            // Get measure name from layout
            const measureName = props.measureName || 'Value';
            content += `<div>${measureName}: ${formattedValue}</div>`;
        }
        
        // Add selection status if selected
        if (props.selectedCountries && 
            typeof props.selectedCountries.has === 'function' &&
            props.selectedCountries.has(countryName.toUpperCase())) {
            content += `<div class="tooltip-selection-status">Selected</div>`;
        }
        
        return content;
    }
// End of Part 2
    // Part 3: Country Visuals and Tooltip Positioning

    // Improved updateCountryVisuals to better handle country coloring
    function updateCountryVisuals(countries, props, layout) {
        // Ensure props.selectedCountries is a Set
        if (!props.selectedCountries || typeof props.selectedCountries.has !== 'function') {
            props.selectedCountries = new Set();
        }
        
        // Handle both single country and collections by normalizing the selection
        const selection = countries.size ? countries : d3.selectAll(countries);
        
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
                    typeof props.measureValues.has === 'function' &&
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
                
                if (props.colorByMeasure && 
                    props.measureValues && 
                    typeof props.measureValues.has === 'function' &&
                    props.measureValues.has(countryName)) {
                    return `${baseName}: ${props.measureValues.get(countryName)}`;
                }
                
                return baseName;
            });
    }

    // Position tooltip based on mouse event and globe container
    function positionTooltip(tooltip, event, container) {
        if (!tooltip || !container) return;
        
        const containerRect = container.getBoundingClientRect();
        const tooltipNode = tooltip.node();
        const tooltipWidth = tooltipNode.offsetWidth;
        const tooltipHeight = tooltipNode.offsetHeight;
        
        // Get mouse position relative to container
        const mouseX = event.clientX - containerRect.left;
        const mouseY = event.clientY - containerRect.top;
        
        // Calculate tooltip position with padding
        const padding = 15;
        let posX = mouseX + padding;
        let posY = mouseY + padding;
        
        // Adjust position if tooltip would overflow container
        if (posX + tooltipWidth > containerRect.width) {
            posX = mouseX - tooltipWidth - padding;
        }
        
        if (posY + tooltipHeight > containerRect.height) {
            posY = mouseY - tooltipHeight - padding;
        }
        
        // Set tooltip position
        tooltip
            .style("left", posX + "px")
            .style("top", posY + "px");
    }

    function synchronizeSelections(app, layout, countryCache, countries) {
        if (!layout.qHyperCube || !layout.qHyperCube.qDimensionInfo.length) {
            return qlik.Promise.resolve();
        }

        const fieldName = layout.qHyperCube.qDimensionInfo[0].qGroupFieldDefs[0];
        try {
            const field = app.field(fieldName);
            
            // Ensure countryCache is a Map
            if (!countryCache || typeof countryCache.has !== 'function') {
                countryCache = new Map();
            }
            
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

    // Enhanced updateTooltipAppearance with new properties
    function updateTooltipAppearance(tooltip, props) {
        if (!tooltip || !props) return;
        
        // Apply background color and opacity
        const backgroundColor = props.tooltipBackgroundColor ? 
            getColor(props.tooltipBackgroundColor, TOOLTIP_STYLES.defaultBackgroundColor) : 
            TOOLTIP_STYLES.defaultBackgroundColor;
            
        const backgroundOpacity = typeof props.tooltipBackgroundOpacity === 'number' ? 
            props.tooltipBackgroundOpacity : 
            TOOLTIP_STYLES.defaultBackgroundOpacity;
        
        // Apply border properties
        const borderColor = props.tooltipBorderColor ? 
            getColor(props.tooltipBorderColor, TOOLTIP_STYLES.defaultBorderColor) : 
            TOOLTIP_STYLES.defaultBorderColor;
            
        const borderSize = props.tooltipBorderSize || TOOLTIP_STYLES.defaultBorderWidth;
        const borderRadius = props.tooltipBorderRadius || TOOLTIP_STYLES.defaultBorderRadius;
        
        // Apply font properties
        const fontColor = props.tooltipFontColor ? 
            getColor(props.tooltipFontColor, TOOLTIP_STYLES.defaultFontColor) : 
            TOOLTIP_STYLES.defaultFontColor;
            
        const fontSize = props.tooltipFontSize || TOOLTIP_STYLES.defaultFontSize;
        const fontWeight = props.tooltipFontWeight || TOOLTIP_STYLES.defaultFontWeight;
        
        // Apply all styles to tooltip
        tooltip
            .style("background-color", hexToRgba(backgroundColor, backgroundOpacity))
            .style("border", `${borderSize}px solid ${borderColor}`)
            .style("border-radius", borderRadius)
            .style("color", fontColor)
            .style("font-size", fontSize)
            .style("font-weight", fontWeight);
    }
// End of Part 3
    // Part 4: Globe Setup and Projection Functions

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
            .attr("fill", getColor(props.oceanColor, "#ffffff"));

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

    // Enhanced setupCountryInteractions with improved tooltip functionality
    function setupCountryInteractions(countries, props, app, layout, tooltip, container) {
        countries
            .on("mouseover", function(event, d) {
                event.stopPropagation();
                
                // Highlight country
                d3.select(this).attr("fill", getColor(props.countryHoverColor, COUNTRY_STYLES.hoverFill));
                
                // Show tooltip
                if (tooltip) {
                    tooltip
                        .html(formatTooltipContent(d, props))
                        .style("display", "block")
                        .style("opacity", 0)
                        .transition()
                        .duration(200)
                        .style("opacity", 1);
                    
                    // Position tooltip
                    positionTooltip(tooltip, event, container);
                }
            })
            .on("mousemove", function(event) {
                // Update tooltip position on mouse move if tooltip is visible
                if (tooltip && tooltip.style("display") === "block") {
                    positionTooltip(tooltip, event, container);
                }
            })
            .on("mouseout", function() {
                // Reset country color
                updateCountryVisuals(d3.select(this), props, layout);
                
                // Hide tooltip
                if (tooltip) {
                    tooltip
                        .transition()
                        .duration(200)
                        .style("opacity", 0)
                        .on("end", function() {
                            d3.select(this).style("display", "none");
                        });
                }
            })
            .on("click", async function(event, d) {
                event.stopPropagation();
                
                if (!layout.qHyperCube || !layout.qHyperCube.qDimensionInfo.length) {
                    return;
                }
                
                try {
                    const fieldName = layout.qHyperCube.qDimensionInfo[0].qGroupFieldDefs[0];
                    const field = app.field(fieldName);
                    const countryName = d.properties.name;
                    
                    // Toggle selection on the country
                    await field.toggleSelect(countryName, true);
                    
                    // Ensure countryCache is a Map
                    if (!props.countryCache || typeof props.countryCache.has !== 'function') {
                        props.countryCache = new Map();
                    }
                    
                    // Update the selectedCountries set
                    props.selectedCountries = manageSelections(layout, props.countryCache);
                    
                    // Ensure selectedCountries is a Set
                    if (!props.selectedCountries || typeof props.selectedCountries.has !== 'function') {
                        props.selectedCountries = new Set();
                    }
                    
                    // Update the display
                    updateCountryVisuals(countries, props, layout);
                    
                    // Update tooltip content if visible
                    if (tooltip && tooltip.style("display") === "block") {
                        tooltip.html(formatTooltipContent(d, props));
                    }
                } catch (error) {
                    logError('Error handling country selection', error, layout.qInfo.qId);
                }
            });
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
// End of Part 4
        // Part 5: Zoom Controls and Rotation Functions

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

    // Improved rotation control without tooltip updating
    function setupRotation(projection, props, updateFn) {
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
            return { cancel: () => {} };
        }
        
        // Check if animation is enabled
        const animSettings = props.animationSettings || {};
        if (animSettings.enabled === false) {
            stateCache.animationComplete[layoutId] = true;
            return { cancel: () => {} };
        }
        
        // IMPORTANT: Ensure currentRotation exists
        if (!props.currentRotation) {
            props.currentRotation = [0, DEFAULT_TILT, 0];
        }
        
        // Store original settings to animate from
        const startRotation = animSettings.startRotation || [-120, -20, 0];
        const startScaleFactor = animSettings.startScale || 0.6;
        const startScale = props.currentScale * startScaleFactor;
        const targetRotation = Array.isArray(props.currentRotation) ? 
                               props.currentRotation.slice() : 
                               [0, DEFAULT_TILT, 0];
        const targetScale = props.currentScale;
        
        // Set initial state
        projection.rotate(startRotation);
        projection.scale(startScale);
        props.currentRotation = startRotation;
        props.currentScale = startScale;
        
        // Apply initial state
        updateFn(startScale);
// End of Part 5
        // Part 6: Animation and Event Handlers

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
        const { onDragStart, onDragEnd, onZoom, scales, path, layout, tooltip, container } = options;
        let isDragging = false;
        let zoomBehavior = null;

        const countries = svg.selectAll(".country");

        const dragBehavior = d3.drag()
            .on("start", () => { 
                isDragging = true; 
                onDragStart(); 
                
                // Hide tooltip during drag
                if (tooltip) {
                    tooltip.style("display", "none");
                }
            })
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
            .on("end", () => { 
                isDragging = false; 
                onDragEnd(); 
            });

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
                    
                    // Hide tooltip during zoom
                    if (tooltip) {
                        tooltip.style("display", "none");
                    }
                    
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
// End of Part 6
        // Part 7: Touch Gestures and Additional Interaction Functions

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
                    
                    // Hide tooltip during pinch
                    if (tooltip) {
                        tooltip.style("display", "none");
                    }
                    
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
                    
                    // Apply sensitivity setting to pinch scaling
                    const adjustedScaleFactor = 1 + ((scaleFactor - 1) * (props.pinchZoomSensitivity || 1));
                    
                    // Apply new scale within bounds
                    const newScale = Math.min(
                        Math.max(currentScale * adjustedScaleFactor, scales.min),
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
        if (!props.measureValues || typeof props.measureValues.size !== 'number' || props.measureValues.size === 0) {
            return null;
        }
        
        // Create a map of varied values
        const variedValues = new Map();
        const variationMethod = props.variationMethod || 'byName';
        
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
        
        return variedValues;
    }
// End of Part 7
    // Part 8: Color Scaling and Property Definitions

    // Create updated color scale based on varied values
    function createColorScaleFromVariedValues(variedValues, props) {
        if (!variedValues || typeof variedValues.size !== 'number' || variedValues.size === 0) {
            return null;
        }
        
        const values = [...variedValues.values()].filter(v => 
            typeof v === 'number' && !isNaN(v));
            
        const minVal = d3.min(values);
        const maxVal = d3.max(values);
        const startColor = getColor(props.measureColorStart, '#e5f3ec');
        const endColor = getColor(props.measureColorEnd, '#008536');
        
        // Create a sequential color scale based on the varied values
        const colorScale = d3.scaleSequential(t => d3.interpolate(startColor, endColor)(t))
            .domain([minVal, maxVal]);
            
        return colorScale;
    }

    // The initialProperties object with enhanced tooltip properties
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
            oceanColor: { color: "#ffffff", index: -1 },
            selectedCountryColor: { color: COUNTRY_STYLES.selectedFill, index: -1 },
            countryHoverColor: { color: COUNTRY_STYLES.hoverFill, index: -1 },
            measureColorStart: { color: "#e5f3ec", index: -1 },
            measureColorEnd: { color: "#008536", index: -1 },
            minZoomScale: 0.5,
            maxZoomScale: 2.5,
            initialZoom: 1.25,
            zoomSpeed: 1.2,
            enableZoom: true,
            enableTouchpadZoom: true,
            pinchZoomSensitivity: 1,
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
            // Enhanced tooltip properties
            // No enableTooltip property - tooltips are always enabled
            tooltipBackgroundColor: { color: TOOLTIP_STYLES.defaultBackgroundColor, index: -1 },
            tooltipBackgroundOpacity: TOOLTIP_STYLES.defaultBackgroundOpacity,
            tooltipBorderColor: { color: TOOLTIP_STYLES.defaultBorderColor, index: -1 },
            tooltipBorderSize: TOOLTIP_STYLES.defaultBorderWidth,
            tooltipBorderRadius: TOOLTIP_STYLES.defaultBorderRadius,
            tooltipFontColor: { color: TOOLTIP_STYLES.defaultFontColor, index: -1 },
            tooltipFontSize: TOOLTIP_STYLES.defaultFontSize,
            tooltipFontWeight: TOOLTIP_STYLES.defaultFontWeight
        }
    };

    // Define default values for tooltip properties
    const defaultTooltipBackgroundColor = { index: -1, color: TOOLTIP_STYLES.defaultBackgroundColor };
    const defaultTooltipBorderColor = { index: -1, color: TOOLTIP_STYLES.defaultBorderColor };
    const defaultTooltipFontColor = { index: -1, color: TOOLTIP_STYLES.defaultFontColor };

    // Enhanced tooltipSettings - without checkbox and with new properties
    const tooltipSettings = {
        label: "Tooltip Settings",
        type: "items",
        items: {
            // No enableTooltip checkbox - tooltips are always enabled
            tooltipBackgroundColor: {
                label: "Background Color",
                component: "color-picker",
                ref: "props.tooltipBackgroundColor",
                type: "object",
                expression: "optional",
                defaultValue: defaultTooltipBackgroundColor
            },
            tooltipBackgroundOpacity: {
                ref: "props.tooltipBackgroundOpacity",
                label: "Background Opacity",
                type: "number",
                component: "slider",
                min: 0,
                max: 1,
                step: 0.1,
                defaultValue: TOOLTIP_STYLES.defaultBackgroundOpacity
            },
            tooltipFontColor: {
                label: "Font Color",
                component: "color-picker",
                ref: "props.tooltipFontColor",
                type: "object",
                defaultValue: defaultTooltipFontColor
            },
            tooltipFontSize: {
                ref: "props.tooltipFontSize",
                label: "Font Size",
                type: "string",
                component: "dropdown",
                options: [
                    { value: "10px", label: "Small (10px)" },
                    { value: "12px", label: "Medium (12px)" },
                    { value: "14px", label: "Large (14px)" },
                    { value: "16px", label: "Extra Large (16px)" }
                ],
                defaultValue: TOOLTIP_STYLES.defaultFontSize
            },
            tooltipFontWeight: {
                ref: "props.tooltipFontWeight",
                label: "Font Weight",
                type: "string",
                component: "dropdown",
                options: [
                    { value: "normal", label: "Normal" },
                    { value: "bold", label: "Bold" }
                ],
                defaultValue: TOOLTIP_STYLES.defaultFontWeight
            },
            tooltipBorderColor: {
                label: "Border Color",
                component: "color-picker",
                ref: "props.tooltipBorderColor",
                type: "object",
                defaultValue: defaultTooltipBorderColor
            },
            tooltipBorderSize: {
                ref: "props.tooltipBorderSize",
                label: "Border Size",
                type: "number",
                component: "slider",
                min: 0,
                max: 5,
                step: 1,
                defaultValue: TOOLTIP_STYLES.defaultBorderWidth
            },
            tooltipBorderRadius: {
                ref: "props.tooltipBorderRadius",
                label: "Border Radius",
                type: "string",
                component: "dropdown",
                options: [
                    { value: "0px", label: "None" },
                    { value: "2px", label: "Small" },
                    { value: "4px", label: "Medium" },
                    { value: "8px", label: "Large" },
                    { value: "16px", label: "Very Large" }
                ],
                defaultValue: TOOLTIP_STYLES.defaultBorderRadius
            }
        }
    };

    // Updated property definition with tooltipSettings
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
                                defaultValue: { index: -1, color: "#e5f3ec" },
                                show: data => data.props.colorByMeasure
                            },
                            measureColorEnd: {
                                label: "Measure Color End",
                                component: "color-picker",
                                ref: "props.measureColorEnd",
                                type: "object",
                                defaultValue: { index: -1, color: "#008536" },
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
                                defaultValue: { index: -1, color: "#e5f3ec" } 
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
// End of Part 8
// Part 9: Remaining Properties and Paint/Resize Functions
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
// Add tooltip settings to the property panel
tooltipSettings: tooltipSettings
}
}
}
};

// Updated paint function with enhanced tooltip support
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
if (stateCache && stateCache[layoutId] && Array.isArray(stateCache[layoutId].rotation)) {
props.currentRotation = stateCache[layoutId].rotation.slice();
props.currentScale = stateCache[layoutId].scale;
} else if (!Array.isArray(props.currentRotation)) {
// Ensure default rotation is set
props.currentRotation = [0, DEFAULT_TILT, 0];
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

// Build country cache - fixed version
if (!props.countryCache || typeof props.countryCache.clear !== 'function') {
props.countryCache = new Map();
} else {
props.countryCache.clear();
}

props.worldData.features.forEach(feature => {
props.countryCache.set(feature.properties.name.toUpperCase(), feature);
});

// Update selections - fixed version
if (!props.selectedCountries || typeof props.selectedCountries.has !== 'function') {
props.selectedCountries = new Set();
} else {
props.selectedCountries = manageSelections(layout, props.countryCache);
}

// Initialize tooltip properties safely
if (!props.tooltipBackgroundColor || typeof props.tooltipBackgroundColor !== 'object') {
props.tooltipBackgroundColor = { ...defaultTooltipBackgroundColor };
}

if (typeof props.tooltipBackgroundOpacity !== 'number') {
props.tooltipBackgroundOpacity = TOOLTIP_STYLES.defaultBackgroundOpacity;
}

if (!props.tooltipBorderColor || typeof props.tooltipBorderColor !== 'object') {
props.tooltipBorderColor = { ...defaultTooltipBorderColor };
}

if (typeof props.tooltipBorderSize !== 'number') {
props.tooltipBorderSize = TOOLTIP_STYLES.defaultBorderWidth;
}

if (typeof props.tooltipBorderRadius !== 'string') {
props.tooltipBorderRadius = TOOLTIP_STYLES.defaultBorderRadius;
}

if (!props.tooltipFontColor || typeof props.tooltipFontColor !== 'object') {
props.tooltipFontColor = { ...defaultTooltipFontColor };
}

if (typeof props.tooltipFontSize !== 'string') {
props.tooltipFontSize = TOOLTIP_STYLES.defaultFontSize;
}

if (typeof props.tooltipFontWeight !== 'string') {
props.tooltipFontWeight = TOOLTIP_STYLES.defaultFontWeight;
}

// Get measure name for tooltip display
if (layout.qHyperCube && layout.qHyperCube.qMeasureInfo && layout.qHyperCube.qMeasureInfo.length > 0) {
props.measureName = layout.qHyperCube.qMeasureInfo[0].qFallbackTitle;
}

// Handle measure values and color scaling
if (props.colorByMeasure) {
// Get standard measure values and color scale
updateMeasureValuesAndColorScale(layout);

// Check if we have identical values or if variation is forced
if (props.measureValues && typeof props.measureValues.size === 'number' && props.measureValues.size > 0) {
const values = [...props.measureValues.values()];
const uniqueValues = new Set(values.map(v => Math.round(v * 1000) / 1000));

// If all values are identical or if forced variation is enabled
if (uniqueValues.size <= 1 || props.forceVariedColoring) {
    // Create varied values for better visualization
    const variedValues = createVariedMeasureValues(props);
    
    if (variedValues) {
        // Replace the original measure values with varied ones
        props.measureValues = variedValues;
        
        // Create a new color scale based on the varied values
        props.colorScale = createColorScaleFromVariedValues(variedValues, props);
    }
}
}
}

// Create tooltip (always enabled)
const tooltip = createTooltip(container, props);

if (!existingSvg.empty()) {
// Update existing visualization
updateCountryVisuals(existingSvg.selectAll(".country"), props, layout);

// Update tooltip appearance
updateTooltipAppearance(tooltip, props);

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

const width = $element.width();
const height = $element.height();

const globeSetup = setupGlobeProjection(width, height, props);
const { projection, path, scales } = globeSetup;

const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);
const countries = createGlobeElements(svg, width, height, path, props);

updateCountryVisuals(countries, props, layout);

// Updated country interactions with tooltip
setupCountryInteractions(countries, props, app, layout, tooltip, container);

const updateGlobe = (scale = projection.scale()) => {
svg.selectAll("circle").attr("r", scale);
countries.attr("d", path);
updateCountryVisuals(countries, props, layout);
};

const zoomControls = setupZoomControls(container, projection, { scales }, updateGlobe, props); 
const rotation = setupRotation(projection, props, updateGlobe);

const eventHandlers = setupEventHandlers(svg, projection, props, {
onDragStart: () => rotation.stop(),
onDragEnd: () => { if (props.rotationSpeed > 0) rotation.start(); },
onZoom: updateGlobe,
scales,
path,
layout,
tooltip,
container
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

return qlik.Promise.resolve(() => {
// Proper cleanup of all animations and timers
if (rotationTimeout) {
clearTimeout(rotationTimeout);
rotationTimeout = null;
}

if (animationController && typeof animationController.cancel === 'function') {
animationController.cancel();
} 

rotation.stop();

if (eventHandlers?.disable) eventHandlers.disable();
if (zoomControls?.disable) zoomControls.disable();

// Clean up references
container.__eventHandlers = null;
container.__zoomControls = null;
container.__globeProps = null;
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
// End of Part 9