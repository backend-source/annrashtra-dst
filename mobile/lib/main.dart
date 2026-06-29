import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'services/api_client.dart';
import 'services/local_store.dart';
import 'services/sync_service.dart';
import 'services/auth_service.dart';
import 'services/photo_uploader.dart';
import 'state/app_state.dart';
import 'screens/login_screen.dart';
import 'screens/home_screen.dart';
import 'theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = LocalStore();
  await store.init();
  final api = ApiClient();
  final sync = SyncService(api, store);
  final auth = AuthService(api, store);
  final uploader = R2Uploader(api); // uploads photos to Cloudflare R2 via presigned URL
  final state = AppState(api, store, sync, auth, uploader);
  runApp(ChangeNotifierProvider<AppState>.value(value: state, child: const PromoterApp()));
}

class PromoterApp extends StatelessWidget {
  const PromoterApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Annrashtra Promoter',
      debugShowCheckedModeBanner: false,
      theme: buildBrandTheme(),
      home: Consumer<AppState>(
        builder: (_, s, _) => s.isLoggedIn ? const HomeScreen() : const LoginScreen(),
      ),
    );
  }
}
