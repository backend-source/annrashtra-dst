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

  // Promoter proposes their canopy spot from the current GPS (online). It stays
  // 'pending' until a supervisor confirms it; then it's usable for check-in.
  Future<void> proposeSpot(double lat, double lng, String name) async {
    await api.post('/api/locations/propose', {'lat': lat, 'lng': lng, 'name': name});
  }

  // Refill requests for this promoter (online).
  Future<List<Map<String, dynamic>>> refillRequests() async {
    final res = await api.get('/api/inventory/refill-requests') as List;
    return res.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  // Promoter confirms delivery of an approved refill with the actual quantity (online).
  Future<void> confirmRefill(String id, int deliveredQty) async {
    await api.post('/api/inventory/refill-requests/$id/confirm', {'delivered_qty': deliveredQty});
  }

  // The promoter's own recent check-ins (online) — used to offer check-out.
  Future<List<Map<String, dynamic>>> myAttendance() async {
    final res = await api.get('/api/attendance/mine') as List;
    return res.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  // Promoter checks out of a check-in (online).
  Future<void> checkOut(String id) async {
    await api.post('/api/attendance/$id/check-out', {});
  }

  // The promoter's cash handovers (online).
  Future<List<Map<String, dynamic>>> collections() async {
    final res = await api.get('/api/collections') as List;
    return res.map((e) => Map<String, dynamic>.from(e as Map)).toList();
  }

  // Promoter's final acceptance of a supervisor-verified handover (online).
  Future<void> acceptCollection(String id) async {
    await api.post('/api/collections/$id/accept', {});
  }

  // Promoter disputes the verified amounts — back to the supervisor (online).
  Future<void> disputeCollection(String id, String note) async {
    await api.post('/api/collections/$id/dispute', {'note': note});
  }

  // The promoter's own overview (revenue, leads, points...). Cached for offline.
  Future<Map<String, dynamic>?> overview() async {
    try {
      final res = await api.get('/api/reports/overview') as Map<String, dynamic>;
      store.cachePut('overview', res);
      return res;
    } on ApiException {
      final cached = store.cacheGet('overview');
      return cached is Map ? Map<String, dynamic>.from(cached) : null;
    }
  }

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
