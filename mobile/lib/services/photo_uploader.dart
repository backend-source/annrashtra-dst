import 'package:http/http.dart' as http;
import 'package:image_picker/image_picker.dart';
import 'api_client.dart';

/// Uploads a captured photo and returns the stored URL (what the API persists).
abstract class PhotoUploader {
  Future<String> upload(XFile file, String folder);
}

/// Placeholder used when no photo storage is configured. The photo is captured
/// and previewed on-device but not uploaded — selfie_url is just a marker.
class StubPhotoUploader implements PhotoUploader {
  @override
  Future<String> upload(XFile file, String folder) async {
    return 'pending-upload://$folder/${DateTime.now().millisecondsSinceEpoch}_${file.name}';
  }
}

/// Uploads photos to Cloudflare R2 via a short-lived presigned URL from our API:
///   1. ask the API for a presigned PUT URL (auth'd as the promoter)
///   2. PUT the image bytes straight to R2
///   3. return the public URL the API then stores on the record.
/// Needs a connection — a network failure surfaces as ApiException(0) so the
/// caller can tell the promoter to retry when online.
class R2Uploader implements PhotoUploader {
  final ApiClient api;
  R2Uploader(this.api);

  String _contentType(String name) {
    final n = name.toLowerCase();
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    return 'image/jpeg';
  }

  @override
  Future<String> upload(XFile file, String folder) async {
    final bytes = await file.readAsBytes();
    final contentType = file.mimeType ?? _contentType(file.name);

    final presign = await api.post('/api/uploads/presign', {
      'folder': folder,
      'filename': file.name,
      'contentType': contentType,
    }) as Map<String, dynamic>;

    http.Response res;
    try {
      res = await http.put(
        Uri.parse(presign['uploadUrl'] as String),
        headers: {'content-type': contentType},
        body: bytes,
      );
    } catch (_) {
      throw ApiException(0, 'Network unavailable');
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      throw ApiException(res.statusCode, 'Photo upload failed (${res.statusCode})');
    }
    return presign['publicUrl'] as String;
  }
}
