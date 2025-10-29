# Building the Android App

This guide provides the steps to build a release APK for the Expense Tracker application, which can be installed on an Android device.

## Prerequisites

- You must have a complete Android development environment set up, including the Java JDK and Android SDK.
- Your `.env` file must be correctly configured with the necessary build variables (like `GOOGLE_OAUTH_REDIRECT_URI`).
- You have `pnpm` installed and the project dependencies are ready.
- Your Google Cloud Console OAuth 2.0 client is properly configured for Android with PKCE support.

## 1. Install Dependencies

If you haven't already, or if there have been changes, make sure all project dependencies are installed by running:

```sh
pnpm install
```

## 2. Run the Release Build

A convenient script has been added to `package.json` to automate the build process. This command will create a production-ready APK.

Run the following command in the project's root directory:

```sh
pnpm build:android:release
```

This process can take several minutes, especially on the first run, as Gradle needs to download dependencies and compile the entire application.

## 3. Locate the APK File

Once the build completes successfully, you will find the generated installation file at the following path:

`android/app/build/outputs/apk/release/app-release.apk`

## 4. Install on Your Device

To test the app:

1.  Connect your Android phone to your computer.
2.  Copy the `app-release.apk` file to your phone's storage (e.g., into the `Downloads` folder).
3.  Open the file manager on your phone, navigate to where you copied the APK, and tap on it to install.
4.  You may need to enable "Install from unknown sources" in your phone's security settings if prompted.

That's it! You can now run the production version of the app on your device.

---

## OAuth 2.0 Security with PKCE

### What is PKCE?

**PKCE (Proof Key for Code Exchange)** is a security extension to the OAuth 2.0 authorization code flow, specifically designed to protect mobile and native applications from authorization code interception attacks.

### Why PKCE is Critical for This App

Traditional OAuth flows rely on a client secret to exchange authorization codes for access tokens. However, mobile apps cannot securely store secrets because:

1. APK files can be decompiled and inspected
2. Secrets embedded in code are easily extracted
3. All users share the same binary, making secrets public

**PKCE solves this** by replacing the static client secret with a dynamically generated code verifier and challenge for each authorization request.

### How PKCE Works in This App

When you initiate Google Drive authentication, the app:

1. **Generates a code verifier** - A cryptographically random string (43-128 characters)
2. **Creates a code challenge** - SHA256 hash of the verifier, base64-URL encoded
3. **Sends challenge to Google** - Authorization request includes `code_challenge` and `code_challenge_method=S256`
4. **Receives authorization code** - User approves access, Google returns code
5. **Exchanges code with verifier** - Token request includes original `code_verifier`
6. **Google validates** - Ensures `SHA256(code_verifier) == code_challenge`
7. **Issues tokens** - Only if validation succeeds

This prevents attackers from intercepting the authorization code, because without the original code verifier (which never leaves the device until the token exchange), the code is useless.

### PKCE Configuration in the Codebase

The app enables PKCE in `src/security/googleAuth.ts`:

```typescript
const buildAppAuthConfig = () => {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  return {
    serviceConfiguration: {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    },
    clientId,
    redirectUrl: redirectUri,
    scopes: [GOOGLE_DRIVE_SCOPE, 'openid', 'profile'],
    usePKCE: true, // ← PKCE enabled here
    additionalParameters: {
      access_type: 'offline',
      prompt: 'consent',
    },
  } as const;
};
```

The `react-native-app-auth` library handles the PKCE flow automatically when `usePKCE: true` is set.

### Google Cloud Console Setup for PKCE

To use PKCE with your Google OAuth client:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** > **Credentials**
3. Create or select your **OAuth 2.0 Client ID** for Android
4. **Application type:** Select "Android" (not "Web application" or "iOS")
5. **Package name:** `com.expensetracker` (or your app's package name)
6. **SHA-1 certificate fingerprint:** Add your debug and release signing certificate fingerprints

**Important:** Android OAuth clients in Google Cloud Console automatically support PKCE. You do NOT need to enable it separately - it's required by default for native apps.

### Obtaining SHA-1 Fingerprints

**For debug builds:**

```sh
keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android
```

**For release builds:**

```sh
keytool -list -v -keystore path/to/your/release.keystore -alias your-key-alias
```

Copy the SHA-1 fingerprint and add it to your OAuth client in Google Cloud Console.

### Verifying PKCE is Working

#### Method 1: Check OAuth Request Parameters

When testing the app, use Android Debug Bridge (adb) to monitor logs:

```sh
adb logcat | grep -i "pkce\|code_challenge"
```

You should see log entries containing `code_challenge` and `code_challenge_method=S256` in the authorization request.

#### Method 2: Network Traffic Inspection

If you have a network inspection tool (e.g., Charles Proxy, mitmproxy):

1. Configure your Android device to use the proxy
2. Trigger the Google Drive login flow
3. Inspect the authorization request to `https://accounts.google.com/o/oauth2/v2/auth`
4. Verify the presence of these parameters:
   - `code_challenge` (base64-URL encoded string, ~43 characters)
   - `code_challenge_method=S256`

#### Method 3: Test with Invalid Verifier

To confirm PKCE enforcement, you can temporarily modify the library (for testing only):

1. Use a valid `code_challenge` during authorization
2. Send a **different** `code_verifier` during token exchange
3. Google should reject the request with an error like:
   ```
   invalid_grant: Code verifier does not match challenge
   ```

**Do not deploy this test code to production.**

#### Method 4: Google OAuth Playground (Limited)

The [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/) can demonstrate PKCE flow, but it uses web-based OAuth:

1. Go to https://developers.google.com/oauthplayground/
2. Click the gear icon (⚙️) in the top right
3. Check **"Use your own OAuth credentials"**
4. Enter your OAuth client ID and secret (if you created a web client)
5. In **Step 1**, select the Drive API scope: `https://www.googleapis.com/auth/drive.file`
6. Click **"Authorize APIs"**
7. In the request details, you should see `code_challenge` and `code_challenge_method=S256`

**Note:** This tests the concept but not your actual Android app configuration. For production verification, use Method 1 or 2 above.

### Security Best Practices

1. **Never commit `.env` files** - Keep `GOOGLE_OAUTH_CLIENT_ID` out of version control
2. **Use different OAuth clients** - Separate clients for debug and release builds
3. **Rotate credentials if exposed** - If your client ID leaks, create a new one immediately
4. **Restrict scopes** - Only request `drive.file` (app-created files), not `drive` (full access)
5. **Monitor OAuth usage** - Check Google Cloud Console for suspicious activity

### Troubleshooting PKCE Issues

**Error: "Invalid client"**

- Verify `GOOGLE_OAUTH_CLIENT_ID` in `.env` matches your Google Cloud Console client
- Ensure the client type is "Android" (not web or iOS)
- Check that SHA-1 fingerprints are correctly added

**Error: "Redirect URI mismatch"**

- Verify `GOOGLE_OAUTH_REDIRECT_URI` in `.env` matches the format: `com.expensetracker:/oauth2redirect/google`
- Ensure this URI is added to "Authorized redirect URIs" in Google Cloud Console (for Android clients, this may not be required)

**Error: "Code verifier does not match challenge"**

- This indicates PKCE is working correctly, but there's a mismatch in the flow
- Ensure you're not tampering with the auth flow
- Try clearing app data and re-authenticating

**No `code_challenge` in authorization request**

- Verify `usePKCE: true` is set in `src/security/googleAuth.ts`
- Check that `react-native-app-auth` version is 8.0.0 or higher
- Rebuild the app completely: `cd android && ./gradlew clean && cd .. && pnpm build:android:release`

### Additional Resources

- [OAuth 2.0 for Mobile & Desktop Apps](https://developers.google.com/identity/protocols/oauth2/native-app)
- [RFC 7636: PKCE Specification](https://datatracker.ietf.org/doc/html/rfc7636)
- [react-native-app-auth Documentation](https://github.com/FormidableLabs/react-native-app-auth)
- [Google Drive API Scopes](https://developers.google.com/drive/api/guides/api-specific-auth)
