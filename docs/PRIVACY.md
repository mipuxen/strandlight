# Privacy

_Plain-language summary for the core instrument (the live demo and anything you run from this repository)._

**What happens to your camera?** The video goes from your camera to a Web Worker in your own browser, where MediaPipe finds 21 points on each hand. Those frames and points are used to draw and play, and are then discarded. **Nothing is uploaded, stored on a server or shared.**

**What is stored?** Only on your device, in your browser's `localStorage`: your settings (mode, theme, language, tempo…), the scene you chose to save, and whether you've finished the guide. Clearing site data removes all of it.

**Recordings** are created on your device and saved straight to your downloads folder.

**Network requests.** The page loads its own files (code, fonts, the MediaPipe runtime and model) from the same site. It contacts no analytics, ad or font services. The only other connection it can make is to `ws://127.0.0.1` if you turn on the optional OSC bridge yourself.

**Cookies.** None.

**Children.** The instrument is open to everyone and collects nothing. Accounts (planned for the optional cloud layer) will require users to be at least 14.

## The planned cloud layer

The official site may later offer optional sign-in with Google to email a recording to yourself or share a performance in a moderated gallery. That layer is **not part of this release**. Before it launches, this page will be updated with exactly what is stored, for how long (e.g. emailed videos deleted after 7 days), the legal basis under GDPR and Korea's PIPA, and how to export or delete your data with one click. It will collect no passwords and no IP addresses.

_This is not legal advice. If Strandlight grows significantly, these texts will be reviewed by a professional._
