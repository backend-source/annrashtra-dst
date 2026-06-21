import 'api_client.dart';
import 'local_store.dart';

class AuthService {
  final ApiClient api;
  final LocalStore store;
  AuthService(this.api, this.store);

  Future<void> requestOtp(String mobile) =>
      api.post('/api/auth/otp/request', {'mobile': mobile});

  /// Verifies the OTP, persists the session, returns the user. Rejects non-
  /// promoters — admins/supervisors belong on the web dashboard.
  Future<Map<String, dynamic>> verifyOtp(String mobile, String code) async {
    final res = await api.post('/api/auth/otp/verify', {'mobile': mobile, 'code': code})
        as Map<String, dynamic>;
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
}
