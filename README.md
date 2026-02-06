# Test Me

A Stream Deck plugin for testing hardware inputs. It gives visual feedback for every Key press, Dial turn, and Touch Strip interaction so you can verify that everything on your device is working.

<img width="423" height="366" alt="2026-02-05-22-13-21-1770358401" src="https://github.com/user-attachments/assets/bf7b961f-4c63-4694-88b4-2b90f5ae765f" />

## What It Does

### Keys
Each Key tracks presses independently. A quick tap flashes green with your down/up count. Hold a Key longer than half a second and it switches to an amber display with a live timer showing how long you've been holding. That timer stays on screen after you let go so you can read it.
### Dials
Dial interactions are broken into three counters — presses (P), rotations (R), and touches (T) — each color-coded at the bottom of the display. The label at the top changes to reflect whatever you just did: PRESS, RELEASE, ROT +3, TAP 120,50, etc. Rotation tracks both total ticks and net direction.
### Touch Strip
Tapping the Touch Strip places a dot at the tap location and displays the coordinates. Taps show as green, holds as orange. The touch counter increments for every interaction.
### Visual States
All feedback is color-coded: blue for active presses, amber for holds, green for completed taps/releases, and orange for touch holds. Keys and dials start in a neutral gray READY state.
## Compatibility

- Windows 10+
- macOS 10.15+
- Stream Deck software 6.9+

Works with any Stream Deck model that has Keys, Dials, or a Touch Strip.
Even works with Stream Deck Pedal (though you'll need to look in the Stream Deck App to see the information.)

## License

MIT
