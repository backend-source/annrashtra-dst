import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:uuid/uuid.dart';
import '../services/api_client.dart';
import '../services/local_store.dart';
import '../services/sync_service.dart';
import '../services/auth_service.dart';
import '../services/photo_uploader.dart';
import '../models/pending_op.dart';

/// App-wide state: session, connectivity, and the offline-first write path.
class AppState extends ChangeNotifier {
  final ApiClient api;
  final LocalStore store;
  final SyncService sync;
  final AuthService auth;
  final PhotoUploader photoUploader;
  final _uuid = const Uuid();

  bool online = true;
  Map<String, dynamic>? user;
  StreamSubscription<List<ConnectivityResult>>? _connSub;

  AppState(this.api, this.store, this.sync, this.auth, this.photoUploader) {
    user = store.user;
    final t = store.token;
    if (t != null) api.setToken(t);
    _watchConnectivity();
  }

  bool get isLoggedIn => user != null;
  List<PendingOp> get queue => store.queue;
  int get pendingCount =>
      store.queue.where((o) => o.status == OpStatus.pending).length;

  void _watchConnectivity() {
    _connSub = Connectivity().onConnectivityChanged.listen((results) {
      final wasOnline = online;
      online = !results.contains(ConnectivityResult.none);
      notifyListeners();
      if (online && !wasOnline) flush(); // auto-sync on reconnect
    });
  }

  Future<void> login(Map<String, dynamic> u) async {
    user = u;
    notifyListeners();
    await flush();
  }

  void logout() {
    store.clearSession();
    api.setToken(null);
    user = null;
    notifyListeners();
  }

  /// Capture a write offline-first: persist locally with a client_uuid, then
  /// attempt to sync. The UI returns immediately whether online or not.
  Future<void> queueWrite({
    required String label,
    required String path,
    required Map<String, dynamic> body,
  }) async {
    final id = _uuid.v4();
    final op = PendingOp(
      clientUuid: id,
      label: label,
      path: path,
      body: {...body, 'client_uuid': id},
      createdAt: DateTime.now(),
    );
    await store.putOp(op);
    notifyListeners();
    await flush();
  }

  Future<SyncResult> flush() async {
    final r = await sync.flush();
    notifyListeners();
    return r;
  }

  Future<void> retry(PendingOp op) async {
    await sync.retry(op);
    notifyListeners();
    await flush();
  }

  /// Products/locations: fetch when online and cache; fall back to cache offline.
  Future<List<Map<String, dynamic>>> products() => _listCached('/api/products', 'products');
  Future<List<Map<String, dynamic>>> locations() => _listCached('/api/locations', 'locations');

  Future<List<Map<String, dynamic>>> _listCached(String path, String key) async {
    try {
      final res = await api.get(path) as List;
      final list = res.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      store.cachePut(key, list);
      return list;
    } on ApiException {
      final cached = store.cacheGet(key);
      if (cached is List) {
        return cached.map((e) => Map<String, dynamic>.from(e as Map)).toList();
      }
      rethrow;
    }
  }

  @override
  void dispose() {
    _connSub?.cancel();
    super.dispose();
  }
}
