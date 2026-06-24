import 'api_client.dart';
import 'local_store.dart';

class AuthService {
  final ApiClient api;
  final LocalStore store;
  AuthService(this.api, this.store);

  // Persist the session from a {token, user} response. Rejects non-promoters —
  // admins/supervisors belong on the web dashboard.
  Map<String, dynamic> _persist(Map<String, dynamic> res) {
    final user = Map<String, dynamic>.from(res['user'] as Map);
    if (user['role'] != 'promoter') {
      throw ApiException(403, 'This app is for promoters. Use the web dashboard.');
    }
    final token = res['token'] as String;
    api.setToken(token);
    store.token = token;
    store.user = user;
    return user;
  }

  /// First step the app calls. If the server has OTP disabled (temporary, until
  /// MSG91 is live) this returns the logged-in user directly. If the server
  /// requires OTP, it returns null and the caller falls back to the OTP flow.
  Future<Map<String, dynamic>?> login(String mobile) async {
    final res = await api.post('/api/auth/login', {'mobile': mobile}) as Map<String, dynamic>;
    if (res['token'] == null) return null; // OTP required
    return _persist(res);
  }

  Future<void> requestOtp(String mobile) =>
      api.post('/api/auth/otp/request', {'mobile': mobile});

  Future<Map<String, dynamic>> verifyOtp(String mobile, String code) async {
    final res = await api.post('/api/auth/otp/verify', {'mobile': mobile, 'code': code})
        as Map<String, dynamic>;
    return _persist(res);
  }
}
