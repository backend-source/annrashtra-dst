import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config.dart';

class ApiException implements Exception {
  final int statusCode; // 0 == network/unreachable
  final String message;
  ApiException(this.statusCode, this.message);

  bool get isNetwork => statusCode == 0;

  @override
  String toString() => 'ApiException($statusCode): $message';
}

/// Thin JSON HTTP client. A network failure surfaces as ApiException(0, ...) so
/// the sync layer can tell "offline, retry later" apart from "rejected by server".
class ApiClient {
  String? _token;
  void setToken(String? t) => _token = t;

  Map<String, String> _headers() => {
        'content-type': 'application/json',
        if (_token != null) 'authorization': 'Bearer $_token',
      };

  Future<dynamic> _send(String method, String path, [Map<String, dynamic>? body]) async {
    final uri = Uri.parse('${AppConfig.apiBase}$path');
    http.Response res;
    try {
      final encoded = body == null ? null : jsonEncode(body);
      if (method == 'POST') {
        res = await http.post(uri, headers: _headers(), body: encoded);
      } else if (method == 'PATCH') {
        res = await http.patch(uri, headers: _headers(), body: encoded);
      } else {
        res = await http.get(uri, headers: _headers());
      }
    } catch (e) {
      throw ApiException(0, 'Network unavailable');
    }
    final data = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode < 200 || res.statusCode >= 300) {
      final msg = data is Map && data['error'] != null
          ? data['error'].toString()
          : 'HTTP ${res.statusCode}';
      throw ApiException(res.statusCode, msg);
    }
    return data;
  }

  Future<dynamic> get(String path) => _send('GET', path);
  Future<dynamic> post(String path, Map<String, dynamic> body) => _send('POST', path, body);
  Future<dynamic> patch(String path, Map<String, dynamic> body) => _send('PATCH', path, body);
}
