class AppConfig {
  // Override per platform with: flutter run --dart-define=API_BASE=...
  //   Web (Chrome):       http://localhost:8080   (default)
  //   Android emulator:   http://10.0.2.2:8080
  //   Physical device:    http://<your-LAN-ip>:8080
  static const String apiBase =
      String.fromEnvironment('API_BASE', defaultValue: 'http://localhost:8080');
}
