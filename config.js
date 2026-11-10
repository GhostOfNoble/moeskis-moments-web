// Settings for this copy of the web app. Nothing private lives here: the client ID is not a secret
// (Google only accepts it from this web address), and the album itself is only reachable after signing in.
window.MOESKI_CONFIG = {
  // From Google Cloud → Credentials → "Moeski web" (Web application).
  clientId: "",
  // The Drive folder the Android app keeps the album in.
  folderName: "Moeski's Moments",
  childName: "Moeski",
};
