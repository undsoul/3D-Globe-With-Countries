# Qlik Globe Country Extension

An interactive 3D globe visualization extension for Qlik Sense that allows users to explore country data in a more engaging and intuitive way.

![Qlik Globe Country Visualization](https://github.com/yourusername/qlik-globe-country/raw/main/screenshots/globe-preview.png)

## Features

- **Interactive 3D Globe**: Navigate countries on a rotatable, zoomable 3D globe
- **Data-Driven Coloring**: Color countries based on measure values with customizable color scales
- **Selection Integration**: Seamlessly integrates with Qlik's selection model
- **Rich Tooltips**: Customizable tooltips show country names and measure values
- **Responsive Design**: Adapts to different screen sizes and orientations
- **Smooth Animations**: Engaging initial animation and smooth rotation
- **Accessibility Features**: Keyboard controls and ARIA attributes for better accessibility
- **Touch Support**: Full touch gesture support for mobile and tablet devices

## Installation

### From Qlik Sense Enterprise

1. Download the latest release ZIP file from the [releases page](https://github.com/yourusername/qlik-globe-country/releases)
2. In the Qlik Management Console (QMC), navigate to **Extensions**
3. Click **Import** and select the downloaded ZIP file
4. Click **Import** to complete the installation

### From Qlik Cloud

1. Download the latest release ZIP file from the [releases page](https://github.com/yourusername/qlik-globe-country/releases)
2. Log in to your Qlik Cloud tenant
3. Navigate to the **Admin Console**
4. Select **Extensions** from the menu
5. Click **Add** button in the top right corner
6. Select the downloaded ZIP file
7. Click **Add** to complete the installation
8. The extension will now be available in the Qlik Sense Hub

### From Qlik Sense Desktop

1. Download the latest release ZIP file from the [releases page](https://github.com/yourusername/qlik-globe-country/releases)
2. Extract the ZIP to your Qlik Sense Desktop extensions directory:
   - Windows: `C:\Users\[USERNAME]\Documents\Qlik\Sense\Extensions\`
3. Restart Qlik Sense Desktop

## Usage

### Basic Setup

1. Drag the Globe Country extension onto your sheet
2. Add a dimension that contains country names
   - The dimension must match the country names in the extension's internal map
3. Optionally add a measure to color countries by value

### Configuration Options

#### Globe Settings

- **Color Mode**: Choose between static coloring or coloring by measure
- **Force Varied Colors**: Enable this option when measure values are identical to create visual variety
- **Variation Method**: Choose how to vary colors (by country name, random, or alphabetical)
- **Country Color**: Set the default color for countries (used in static color mode)
- **Measure Color Start/End**: Define the color gradient for measure-based coloring
- **Selected Country Color**: Color for selected countries
- **Country Hover Color**: Color when hovering over countries
- **Ocean Color**: Background color for the globe
- **Rotation Speed**: Control how fast the globe rotates (0 to disable rotation)

#### Animation Settings

- **Enable Initial Animation**: Toggle the intro animation
- **Animation Duration**: Set the duration of the intro animation

#### Zoom Settings

- **Enable Zoom Controls**: Show/hide zoom controls
- **Enable Touchpad/Pinch Zoom**: Enable zooming with touchpad or pinch gestures
- **Zoom Controls Visibility**: Choose when zoom controls appear (always, on hover, never)
- **Min/Max Zoom Scale**: Set zoom limits
- **Initial Zoom Level**: Set the starting zoom level
- **Zoom Speed Factor**: Control how fast zooming occurs
- **Pinch Zoom Sensitivity**: Adjust sensitivity for touch devices

#### Tooltip Settings

Extensive tooltip customization options:
- Background color and opacity
- Text styling (color, size, weight)
- Measure value styling
- Border options
- Shadow effects
- Padding and spacing

## Technical Details

### Requirements

- Qlik Sense February 2021 or later
- Compatible with both Qlik Sense Enterprise and Desktop

### Dependencies

- D3.js v7 for visualization
- Globe coordinates data is included in the extension

### Browser Compatibility

- Chrome, Firefox, Safari, Edge (latest versions)
- Mobile browsers with touch support

## Troubleshooting

### Common Issues

#### Countries Not Displaying Correctly

Make sure your dimension values match the country names used in the extension. The extension uses standard English country names.

#### Identical Measure Values

If all countries show the same color when using measure coloring, enable the "Force Varied Colors" option to create visual differentiation.

#### Performance Issues

For large dashboards or slower devices:
- Reduce the rotation speed
- Disable the initial animation
- Use static coloring instead of measure-based coloring

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- World map data derived from Natural Earth
- Built with D3.js
- Inspired by other globe visualizations in the data visualization community
