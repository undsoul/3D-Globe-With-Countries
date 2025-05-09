# Qlik Globe - Interactive Country Map Extension

https://github.com/user-attachments/assets/c2ecf060-097e-40f4-b691-3658bed707c0

## Overview

Qlik Globe is an interactive 3D globe visualization extension for Qlik Sense that allows users to visualize country-based data on a rotatable, zoomable globe. This extension is perfect for global analytics, international comparisons, and geospatial data visualization.

## Features

- **Interactive 3D Globe**: Rotate, zoom, and interact with a beautiful 3D globe visualization
- **Responsive Design**: Adapts to different screen sizes and device types
- **Country Selection**: Click countries to make selections in your Qlik app
- **Data-Driven Coloring**: Color countries based on measure values with customizable color gradient
- **Smooth Animations**: Elegant initial animation and smooth rotation
- **Rich Tooltips**: Informative tooltips showing country names and measure values
- **Advanced Customization**: Extensive property panel with options for colors, behavior, and interactions
- **Touch Support**: Full support for touch gestures including pinch-to-zoom
- **Accessibility Features**: Keyboard navigation and ARIA attributes for better accessibility


## Installation

### Qlik Sense Desktop / On-Premises

1. Download the latest release ZIP file from the [releases page](https://github.com/yourusername/qlik-globe/releases)
2. Extract the ZIP file
3. Copy the extracted folder to your Qlik Sense extensions directory:
   - Qlik Sense Desktop: `C:\Users\[USERNAME]\Documents\Qlik\Sense\Extensions\`
   - Qlik Sense Server: Import through the QMC (Qlik Management Console)

### Qlik Sense Cloud

1. Download the latest release ZIP file from the [releases page](https://github.com/yourusername/qlik-globe/releases)
2. Log in to your Qlik Sense Cloud tenant
3. Navigate to the hub and open the app where you want to use the extension
4. Click on "Add new" in the left panel
5. Select "Extension" and then "Upload extension"
6. Choose the downloaded ZIP file and upload
7. The extension will now be available in your app

## Usage

1. Drag and drop the "Qlik Globe" extension onto your sheet
2. Add a dimension that contains country names (must match standard country naming conventions)
3. Optionally add a measure to color countries based on data values
4. Use the property panel to customize the appearance and behavior

### Required Data Format

- The dimension should contain country names in standard English format (e.g., "United States", "Germany", "Japan")
- For best results, ensure country names match the standard naming conventions in the extension

## Configuration Options

### Globe Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Color Mode | Choose between static coloring or measure-based coloring | Static |
| Country Color | Default color for countries when using static mode | #d4dadc |
| Measure Color Start | Start color of the gradient for measure-based coloring | #e5f3ec |
| Measure Color End | End color of the gradient for measure-based coloring | #008536 |
| Selected Country Color | Color for selected countries | #006580 |
| Country Hover Color | Color when hovering over a country | #b8bfc2 |
| Ocean Color | Background color of the globe (oceans) | #ffffff |
| Rotation Speed | Speed of automatic globe rotation | 20 |

### Animation Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Enable Initial Animation | Enable/disable the initial zoom animation | Enabled |
| Animation Duration | Duration of the initial animation in milliseconds | 2000 |

### Zoom Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Enable Zoom Controls | Show/hide zoom control buttons | Enabled |
| Enable Touchpad/Pinch Zoom | Enable zooming with touchpad or pinch gestures | Enabled |
| Zoom Controls Visibility | Control when zoom buttons are visible (Always/On Hover/Never) | Always |
| Minimum Zoom Scale | Minimum zoom level | 0.5 |
| Maximum Zoom Scale | Maximum zoom level | 2.5 |
| Initial Zoom Level | Starting zoom level | 1.25 |
| Zoom Speed Factor | Speed factor for zoom controls | 1.2 |
| Pinch Zoom Sensitivity | Sensitivity for pinch-to-zoom on touch devices | 1 |

### Tooltip Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Background Color | Tooltip background color | #F8F9FA |
| Background Opacity | Transparency of tooltip background | 0.9 |
| Font Color | Text color in tooltips | #006580 |
| Font Size | Size of tooltip text | 12px |
| Font Weight | Weight of tooltip text (Normal/Bold) | Normal |
| Border Color | Color of tooltip border | #ffffff |
| Border Size | Width of tooltip border in pixels | 1 |
| Border Radius | Roundness of tooltip corners | 4px |

## Advanced Options

### Force Varied Coloring

When all countries have the same measure value, this option creates artificial variations in coloring to make countries visually distinguishable. Useful for single-value visualizations.

### Variation Methods

When Force Varied Coloring is enabled:

- **By Country Name**: Varies colors based on the country name
- **Random**: Applies random variations to colors
- **Alphabetical**: Varies colors based on alphabetical order

## Browser Compatibility

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)

## Dependencies

This extension uses:
- D3.js v7 for visualization
- Qlik Sense APIs for data handling and selections

## Limitations

- Works best with standard country names in English
- Performance may vary with large datasets
- Best viewed on larger screens, though responsive design works on mobile

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Author

[Your Name/Organization]

## Acknowledgments

- Qlik for their platform and APIs
- D3.js team for their amazing visualization library
- Contributors and testers who provided valuable feedback

---

## Support

If you encounter any issues or have questions, please file an issue on the [GitHub issues page](https://github.com/yourusername/qlik-globe/issues).

For commercial support or custom development, please contact [your email address].

## FAQ

### The globe is not showing some countries correctly

Make sure your country names match standard naming conventions. Check the console for any errors related to country mapping.

### How can I change the default view position?

You can modify the `currentRotation` property in the code to change the default view when the visualization loads.

### Can I use this with my own custom geography data?

The extension currently uses standard world geography data. Custom geography would require modifications to the code.

### Is this extension compatible with Qlik Sense Mobile?

Yes, the extension is designed to be responsive and includes touch support for mobile devices.
