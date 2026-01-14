# AvanteHub GPS

## Overview
AvanteHub GPS is an Expo React Native application for GPS navigation and route management. It allows users to import GPS routes in JSON format and navigate through waypoints with real-time location tracking.

## Project Structure
- `app/` - Expo Router screens
  - `index.tsx` - Route import screen
  - `navigate.tsx` - GPS navigation screen with compass and map
  - `_layout.tsx` - Root layout with navigation stack
- `lib/` - Utility libraries
  - `geo.ts` - Geographic calculations (haversine, bearing)
  - `store.ts` - Zustand state management
  - `validation.ts` - Route data validation
  - `MapView.tsx` / `MapView.web.tsx` - Platform-specific map components
- `hooks/` - Custom React hooks
- `assets/` - Images and fonts

## Tech Stack
- **Framework**: Expo SDK 54 with expo-router
- **Language**: TypeScript
- **State Management**: Zustand
- **Navigation**: expo-router (file-based routing)
- **Maps**: react-native-maps (native) with web fallback
- **Location**: expo-location

## Running the Project
The project runs on port 5000 using `npm run dev` which starts the Expo web server.

## Key Features
- JSON route import with validation
- Real-time GPS navigation
- Compass-based direction guidance
- Waypoint tracking and collection confirmation
- Platform-specific handling (web fallback for native features)

## Notes
- Maps are only available on native platforms (iOS/Android via Expo Go)
- Web version shows coordinate display instead of interactive maps
- The app uses Portuguese language for the UI
