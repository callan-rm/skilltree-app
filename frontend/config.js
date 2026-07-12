// Local dev talks to the backend on localhost; anywhere else (once this is
// hosted publicly) talks to the deployed Render backend.
const API_BASE = (location.hostname === "127.0.0.1" || location.hostname === "localhost")
  ? "http://127.0.0.1:8000"
  : "https://skilltree-app-ikdf.onrender.com";
