# Premiere Pro MCP Server

An MCP (Model Context Protocol) server that enables Claude to find specific parts of video clips using speech transcription and visual analysis, then add them to your Adobe Premiere Pro timeline.

## Features

- **Speech Analysis**: Transcribe video audio with word-level timestamps using Whisper (local)
- **Visual Analysis**: Extract and analyze video frames using Claude Vision
- **Segment Finding**: Search transcripts and visual descriptions to find specific moments
- **Timeline Control**: Insert or overwrite clips directly in Premiere Pro

## Requirements

- Node.js 18+
- Adobe Premiere Pro 2019+ (tested on 2025/2026)
- FFmpeg installed and in PATH
- Anthropic API key (for Claude Vision)

## Installation

### 1. Clone and Build the MCP Server

```bash
git clone https://github.com/toonyai/premiere-mcp.git
cd premiere-mcp
npm install
npm run build
```

### 2. Install the Premiere Pro Panel

Copy the `premiere-panel` folder to your CEP extensions directory:

**macOS:**
```bash
# Create extensions directory if it doesn't exist
mkdir -p ~/Library/Application\ Support/Adobe/CEP/extensions

# Copy the panel
cp -r premiere-panel ~/Library/Application\ Support/Adobe/CEP/extensions/com.mcp.premiere.bridge

# Install the WebSocket dependency
cd ~/Library/Application\ Support/Adobe/CEP/extensions/com.mcp.premiere.bridge
npm init -y
npm install ws
```

**Windows:**
```powershell
# Copy the panel
Copy-Item -Recurse premiere-panel "$env:APPDATA\Adobe\CEP\extensions\com.mcp.premiere.bridge"

# Install the WebSocket dependency
cd "$env:APPDATA\Adobe\CEP\extensions\com.mcp.premiere.bridge"
npm init -y
npm install ws
```

### 3. Enable Unsigned Extensions (Required for Development)

**macOS:**
```bash
# For Premiere Pro 2024+
defaults write com.adobe.CSXS.11 PlayerDebugMode 1
defaults write com.adobe.CSXS.12 PlayerDebugMode 1
```

**Windows:**
Add registry keys:
- `HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.11\PlayerDebugMode` = `1`
- `HKEY_CURRENT_USER\SOFTWARE\Adobe\CSXS.12\PlayerDebugMode` = `1`

### 4. Configure Claude Desktop

Add to your Claude Desktop configuration file:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "premiere-video-editor": {
      "command": "node",
      "args": ["/FULL/PATH/TO/premiere-mcp/dist/index.js"],
      "env": {
        "ANTHROPIC_API_KEY": "your-anthropic-api-key"
      }
    }
  }
}
```

**Important:** Replace `/FULL/PATH/TO/premiere-mcp` with the actual path where you cloned the repo.

### 5. Restart Applications

1. Quit and reopen **Premiere Pro**
2. Quit and reopen **Claude Desktop**
3. In Premiere Pro, open **Window > Extensions > MCP Bridge**
4. The panel should show "Connected" when Claude Desktop is running

## Usage

Once connected, you can ask Claude in Claude Desktop:

### Analyze Speech
> "Analyze the speech in /path/to/video.mp4"

### Analyze Visual Content
> "Analyze the visual content in /path/to/video.mp4 at 1 frame per second"

### Find Specific Moments
> "Find all parts where they mention 'product launch' in /path/to/video.mp4"

### Add to Timeline
> "Add the segment from 12.5s to 18.3s of 'Footage/interview.mp4' to my timeline"

### Full Workflow
> "Analyze /path/to/interview.mp4, find all parts where they discuss 'machine learning', and add them to my timeline"

## MCP Tools

| Tool | Description |
|------|-------------|
| `analyze_video_speech` | Transcribe video with Whisper |
| `analyze_video_visual` | Analyze frames with Claude Vision |
| `find_video_segments` | Search for specific content |
| `add_segment_to_timeline` | Insert clip into Premiere timeline |
| `get_premiere_project_info` | Get project structure |
| `get_analysis_status` | Check analysis progress |

## Troubleshooting

### Panel not showing in Premiere Pro
- Ensure the panel is in the correct CEP extensions folder
- Verify debug mode is enabled for your CSXS version
- Restart Premiere Pro completely (quit and reopen)

### Panel shows "Disconnected"
- Make sure `ws` module is installed in the panel folder
- Restart Premiere Pro after installing dependencies
- Ensure Claude Desktop is running with the MCP server configured

### "Not connected to Premiere Pro" error in Claude
- Open the MCP Bridge panel in Premiere Pro first
- Check that port 8847 is not blocked by firewall
- Restart Claude Desktop

### Whisper transcription fails
- Install FFmpeg: `brew install ffmpeg` (macOS) or download from ffmpeg.org
- First run downloads the Whisper model (~150MB for "base")
- Check disk space in `~/.premiere-mcp/`

### Visual analysis fails
- Verify ANTHROPIC_API_KEY is set correctly
- Check API credits at console.anthropic.com

## Project Structure

```
premiere-mcp/
├── src/                    # TypeScript source
│   ├── index.ts           # MCP server entry point
│   ├── tools/             # MCP tool handlers
│   ├── analyzer/          # Whisper + Vision analysis
│   ├── premiere/          # WebSocket bridge client
│   └── cache/             # SQLite analysis cache
├── premiere-panel/         # CEP extension for Premiere
│   ├── CSXS/manifest.xml  # Extension manifest
│   ├── jsx/premiere.jsx   # ExtendScript commands
│   └── js/                # Panel scripts
├── dist/                   # Compiled JavaScript
└── package.json
```

## How It Works

1. **MCP Server** runs as a subprocess of Claude Desktop
2. **CEP Panel** in Premiere Pro starts a WebSocket server on port 8847
3. When you ask Claude to edit video, it:
   - Analyzes video using Whisper (speech) or Claude Vision (visual)
   - Caches results in SQLite for fast subsequent queries
   - Finds matching segments based on your query
   - Sends commands to Premiere Pro via WebSocket → ExtendScript

## License

MIT

## Credits

Built with:
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [nodejs-whisper](https://github.com/ChetanXpro/nodejs-whisper)
- [Anthropic Claude API](https://www.anthropic.com/)
- Adobe CEP/ExtendScript
