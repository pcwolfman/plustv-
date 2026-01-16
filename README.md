# PlusIPTV

IPTV Player with Xtream Codes API and M3U support.

## Features

- Xtream Codes API integration
- M3U playlist support (URL and file upload)
- Multiple user/playlist management
- Category-based channel organization
- Favorites and recently watched channels
- Responsive design for all screen sizes

## Installation

### Option 1: Using npm (Recommended if Node.js is installed)

```bash
npm install
```

This will install:
- `axios` - For HTTP requests
- `m3u-parser` - For M3U file parsing

### Option 2: Using CDN (No installation needed)

The project already includes CDN links for required libraries:
- Axios (for HTTP requests) - Already added to settings.html
- HLS.js (for video streaming) - Already added to index.html

## Usage

1. Open `index.html` in a web browser
2. Click the user icon to go to Settings
3. Add IPTV sources:
   - **Xtream Codes**: Enter server URL, username, and password
   - **M3U URL**: Enter M3U playlist URL or upload a file
4. Select the channel source from the dropdown
5. Browse and watch channels

## Libraries Used

- **HLS.js**: For playing HLS/m3u8 video streams
- **Axios**: For making HTTP requests (alternative to fetch API)
- **m3u-parser**: For parsing M3U playlist files (optional, can use custom parser)

## Browser Support

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers

## Notes

- For M3U URLs with CORS issues, use the file upload option
- Xtream Codes requires valid server credentials
- All data is stored in browser localStorage

☕ If you find this project helpful, consider [buying me a coffee](https://buymeacoffee.com/pcwolfman).


<script type="text/javascript" src="https://cdnjs.buymeacoffee.com/1.0.0/button.prod.min.js" data-name="bmc-button" data-slug="pcwolfman" data-color="#FFDD00" data-emoji="☕" data-font="Cookie" data-text="Bana bir kahve ısmarla" data-outline-color="#000000" data-font-color="#000000" data-coffee-color="#ffffff" ></script>

















