# Building the Daily Alpha AI IPA

## Requirements (macOS only — Apple mandates this)
- Mac with macOS 13+
- Xcode 15+ (free from App Store)
- Apple Developer Account ($99/year for App Store, or free for personal device sideloading)
- Node.js 18+

## Steps

### 1. Install dependencies
```bash
npm install
```

### 2. Initialize Capacitor
```bash
npx cap init "Daily Alpha AI" com.dailyalphaai.app --web-dir .
```

### 3. Add iOS platform
      - name: Prepare web assets
        run: mkdir -p www && cp index.html www/

      - name: Add iOS platform
        run: npx cap add ios

      - name: Sync Capacitor
        run: npx cap sync ios


### 4. Open in Xcode
```bash
npx cap open ios
```

### 5. In Xcode
1. Select your **Team** under Signing & Capabilities
2. Change Bundle Identifier to something unique (e.g. `com.yourname.dailyalphaai`)
3. Select your target device or **Any iOS Device**

### 6a. Build IPA for TestFlight / App Store
- Product → Archive
- Distribute App → App Store Connect
- Upload to TestFlight or submit for review

### 6b. Build IPA for personal sideloading (free account)
- Product → Archive
- Distribute App → Development
- Export → saves `.ipa` to your Desktop
- Install via Apple Configurator 2 or AltStore

## App Store submission notes
- You'll need screenshots (6.7" and 5.5" iPhone)
- Add a Privacy Policy URL (required)
- Category: Finance
- Add the disclaimer in your App Store description:
  "For educational purposes only. Not financial advice."

## Sideloading without a Developer account
Use **AltStore** (altstore.io) — install the IPA on your own device for free,
renews every 7 days automatically while AltStore is running on your Mac.
