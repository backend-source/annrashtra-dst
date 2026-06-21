import 'dart:convert';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/pending_op.dart';

/// Durable local storage (Hive — works on Android and web). Holds the session,
/// the offline write queue, and a small read-cache (e.g. products, locations).
class LocalStore {
  late Box _settings;
  late Box<String> _queue;
  late Box<String> _cache;

  Future<void> init() async {
    await Hive.initFlutter();
    _settings = await Hive.openBox('settings');
    _queue = await Hive.openBox<String>('queue');
    _cache = await Hive.openBox<String>('cache');
  }

  // ---- session ----
  String? get token => _settings.get('token') as String?;
  set token(String? v) =>
      v == null ? _settings.delete('token') : _settings.put('token', v);

  Map<String, dynamic>? get user {
    final s = _settings.get('user') as String?;
    return s == null ? null : Map<String, dynamic>.from(jsonDecode(s) as Map);
  }

  set user(Map<String, dynamic>? v) =>
      v == null ? _settings.delete('user') : _settings.put('user', jsonEncode(v));

  void clearSession() {
    _settings.delete('token');
    _settings.delete('user');
  }

  // ---- offline queue ----
  List<PendingOp> get queue =>
      _queue.values.map(PendingOp.decode).toList()
        ..sort((a, b) => a.createdAt.compareTo(b.createdAt));

  Future<void> putOp(PendingOp op) => _queue.put(op.clientUuid, op.encode());
  Future<void> removeOp(String clientUuid) => _queue.delete(clientUuid);

  // ---- read cache ----
  void cachePut(String key, dynamic value) => _cache.put(key, jsonEncode(value));
  dynamic cacheGet(String key) {
    final s = _cache.get(key);
    return s == null ? null : jsonDecode(s);
  }
}
