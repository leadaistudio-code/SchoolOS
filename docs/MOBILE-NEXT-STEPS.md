# Finishing the Android app — five things, in order

Written for someone who has not built an Android app before. Do them in this
order; each one is independent, but 1 is the only one that stops the app
working at all.

Two are already done — 2 and 5 — and are recorded here so you know why.

---

## 1. Deploy the backend  ✅ done

**The problem.** The app talks to `https://www.mycampusview.com/api/v1`. The
sign-in screen calls an endpoint that only exists in the code that was just
pushed. Until the live server runs that code, sign-in fails.

**What has been done.** The code is committed and pushed to `master`.

**What you do.**

1. Open [Railway](https://railway.app) and go to your web service.
2. Click **Deployments**. A new build should have started when the push landed.
3. Wait for it to say **Success** — normally two to four minutes.

**Check it worked.** Run this in a terminal:

```bash
curl -s -o /dev/null -w "%{content_type}\n" https://www.mycampusview.com/api/v1/site/school/demo
```

- `application/json` → **deployed.** The endpoint is live.
- `text/html` → not deployed yet. Wait, or see below.

You will get a *404 status* either way, because there is no school called
`demo` in production — that is only local test data. The **content type** is
what tells you whether the code shipped, not the status.

**If no deployment started:** Railway only builds automatically when GitHub is
connected. In the service, go to **Settings → Source** and confirm it points at
`leadaistudio-code/SchoolOS` on branch `master`. Otherwise press **Deploy**.

**Confirmed deployed** on 19 August 2026 — the endpoint returns JSON.

### The school code to type

**`little-pathshala`** — with the hyphen.

Production has three schools:

| Code | Name |
|---|---|
| **`little-pathshala`** | Little Pathshala |
| `demo` | Demo International School |
| `test` | test |

Then sign in with the same email and password you use on the web.

Check any code with:

```bash
curl -s https://app.mycampusview.com/api/v1/site/school/little-pathshala
```

### Why the first attempt failed — `app.`, not `www.`

The app originally pointed at `https://www.mycampusview.com/api/v1`. That host
runs with `APP_ROLE=marketing`, and [middleware.ts](../src/middleware.ts)
redirects every `/api/*` path except `/api/v1/site/*` to the front page in that
mode.

So the school lookup worked — it is under `/api/v1/site/` — and sign-in got a
**307 redirect to `/`**, which `fetch` followed to an HTML page. The app then
had no JSON to read and reported "Could not sign in. Please try again.", which
is true and useless.

Two fixes, both shipped:

1. The app now points at **`app.mycampusview.com`**. `app` is a reserved
   subdomain, so it never binds to one school by host and `X-Tenant-Slug`
   decides — which is what a single app installed for every school needs.
2. A 2xx response that is not the API envelope now raises a clear error naming
   the path, instead of a `TypeError` surfacing as "please try again".

Two things worth tidying, neither urgent:

- The `test` school looks like leftover setup. Archive it before real schools
  are onboarded, so nobody signs into it by accident.
- On `demo`, the name is "Demo International School" but the sign-in headline
  reads "Welcome to MyCampusView International School". Settings → Branding
  fixes it.

---

## 2. The build path with spaces  ✅ already fixed

**The problem.** The folder is `…\Lead AI Studio Project\School ERP\`. The tool
that compiles React Native's C++ (`ninja`) breaks on spaces in a path, with
`manifest 'build.ninja' still dirty after 100 tries`. A shortcut/junction does
not help — Gradle follows it back to the real path.

**What has been done.** [`mobile/scripts/build-android.ps1`](../mobile/scripts/build-android.ps1)
copies the project to `C:\mcvbuild` (no spaces), builds there, and copies the
finished APK back into `releases/`. It also deletes the JavaScript cache first,
because Gradle otherwise reports it "up to date" and ships old code.

**What you do.** Nothing, except use it:

```powershell
.\mobile\scripts\build-android.ps1 -Phone           # 45 MB, real phones
.\mobile\scripts\build-android.ps1 -All             # 103 MB, also emulators
.\mobile\scripts\build-android.ps1 -All -Bundle     # also the .aab for Play
```

**Want it gone permanently?** Move the whole project to a folder with no spaces,
for example `C:\SchoolERP\`. Then the copy step is unnecessary. Nothing else in
the project cares about the path.

`C:\mcvbuild` is 3 GB. Deleting it is safe — the script recreates it — but the
next build will be much slower.

---

## 3. The signing key

**The problem, and why it is smaller than it sounds.** An Android app is signed
with a key. The one in this build was generated for testing.

You have probably read that losing your key means you can never update your app
again. **That has not been true since 2021.** Google Play now keeps the real
signing key for you (*Play App Signing*). What you upload with is only an
*upload key*, and if you lose that, Google support resets it. So this is worth
doing properly, but it is not a one-shot decision you can ruin.

**What you do.**

1. Pick a strong password and put it in your password manager **first**.
2. Generate the key (replace `YOUR_PASSWORD` in both places):

```bash
cd mobile/android/app
keytool -genkeypair -v -storetype PKCS12 \
  -keystore mycampusview-upload.keystore \
  -alias mycampusview -keyalg RSA -keysize 2048 -validity 10950 \
  -storepass YOUR_PASSWORD -keypass YOUR_PASSWORD \
  -dname "CN=MyCampusView, O=MyCampusView, L=Pune, ST=Maharashtra, C=IN"
```

3. Point the build at it — edit `mobile/android/keystore.properties`:

```properties
storeFile=app/mycampusview-upload.keystore
storePassword=YOUR_PASSWORD
keyAlias=mycampusview
keyPassword=YOUR_PASSWORD
```

4. **Back up the `.keystore` file somewhere that is not this laptop.** Google
   Drive, a password manager attachment, anywhere with a copy. It is not in git
   on purpose — a signing key committed next to the app it signs protects
   nothing.
5. Rebuild: `.\mobile\scripts\build-android.ps1 -All -Bundle`

**Note:** `mobile/android/` is regenerated by `npx expo prebuild`. If you ever
run that, the keystore and `keystore.properties` are deleted with it. Keep the
backup.

---

## 4. Push notifications, uploads and downloads

**The problem.** The libraries are installed and the Android permissions are
declared, but nothing uses them yet. Push in particular needs a Firebase
project, which has to be created under your own Google account.

**What you do — Firebase, about ten minutes.**

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and
   create a project called *MyCampusView*.
2. Click the Android icon to add an app. For **package name** enter exactly:
   `com.mycampusview.app`
3. Download **`google-services.json`** and put it in the `mobile/` folder.
4. In Firebase: **Project settings → Service accounts → Generate new private
   key**. Save that JSON somewhere safe — it is a server secret and must never
   go in the app or in git.
5. In Railway, add the contents of that JSON as an environment variable, e.g.
   `FCM_SERVICE_ACCOUNT`.

**Then tell me**, and I will wire the rest: registering the device token
against the signed-in user, sending through the existing
`POST /api/v1/push/subscribe` route, and opening the right screen when a
notification is tapped.

**Uploads and downloads** are a smaller job with no accounts to create. The
catch is that the modules that actually upload — student documents,
assessments — are the ones still web-only, so they need building first.

---

## 5. The 103 MB app  ✅ already fixed

**The problem.** Phones use different chip types. The first build included all
four, so three-quarters of it could never run on any given phone.

**What has been done.** The build script takes `-Phone`, which builds only
`arm64-v8a` — the chip in essentially every Android phone sold since about 2018.

| File | Size | Use |
|---|---|---|
| `MyCampusView-v2.0.0-phone.apk` | **45 MB** | Send this to people |
| `MyCampusView-v2.0.0.apk` | 103 MB | Only if you need emulator support |
| `MyCampusView-v2.0.0.aab` | 73 MB | Upload this to Google Play |

**For the Play Store, size stops being your problem.** You upload the `.aab`,
and Google builds a custom download per device — usually around 25 MB. You
never upload an APK to Play.

---

## Quick reference

```powershell
# Build for phones (45 MB)
.\mobile\scripts\build-android.ps1 -Phone

# Build everything including the Play bundle
.\mobile\scripts\build-android.ps1 -All -Bundle

# Install on a plugged-in phone with USB debugging on
adb install -r releases\MyCampusView-v2.0.0-phone.apk

# Is the backend deployed?
curl -s -o /dev/null -w "%{content_type}\n" https://www.mycampusview.com/api/v1/site/school/demo
```
