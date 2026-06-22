import 'package:image_picker/image_picker.dart';

/// Uploads a captured photo and returns the stored URL (what the API persists).
abstract class PhotoUploader {
  Future<String> upload(XFile file, String folder);
}

/// Placeholder used until a Firebase Storage project is configured. The photo is
/// captured and previewed on-device, but not yet uploaded — the attendance record
/// still syncs (selfie_url is free text). Swap for a FirebaseUploader later:
/// it only needs to implement upload() and return the download URL.
class StubPhotoUploader implements PhotoUploader {
  @override
  Future<String> upload(XFile file, String folder) async {
    return 'pending-upload://$folder/${DateTime.now().millisecondsSinceEpoch}_${file.name}';
  }
}
