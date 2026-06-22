import 'package:geolocator/geolocator.dart';

class LocationResult {
  final double lat;
  final double lng;
  LocationResult(this.lat, this.lng);
}

/// Device GPS with permission handling. Throws a readable message when location
/// is off or denied so callers can fall back to manual entry.
class LocationService {
  static Future<LocationResult> current() async {
    if (!await Geolocator.isLocationServiceEnabled()) {
      throw Exception('Location is off. Turn on GPS or enter coordinates manually.');
    }
    var perm = await Geolocator.checkPermission();
    if (perm == LocationPermission.denied) {
      perm = await Geolocator.requestPermission();
    }
    if (perm == LocationPermission.denied || perm == LocationPermission.deniedForever) {
      throw Exception('Location permission denied. Enter coordinates manually.');
    }
    final pos = await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
    );
    return LocationResult(pos.latitude, pos.longitude);
  }
}
