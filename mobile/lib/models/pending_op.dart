import 'dart:convert';

enum OpStatus { pending, error }

/// A write captured offline. The clientUuid is generated on the device and sent
/// as `client_uuid` in the body so the server can dedupe replays (idempotency).
class PendingOp {
  final String clientUuid;
  final String label; // human-readable, shown in the sync queue
  final String path; // API path, e.g. /api/leads
  final Map<String, dynamic> body;
  final DateTime createdAt;
  OpStatus status;
  String? lastError;
  int attempts;

  PendingOp({
    required this.clientUuid,
    required this.label,
    required this.path,
    required this.body,
    required this.createdAt,
    this.status = OpStatus.pending,
    this.lastError,
    this.attempts = 0,
  });

  Map<String, dynamic> toJson() => {
        'clientUuid': clientUuid,
        'label': label,
        'path': path,
        'body': body,
        'createdAt': createdAt.toIso8601String(),
        'status': status.name,
        'lastError': lastError,
        'attempts': attempts,
      };

  factory PendingOp.fromJson(Map<String, dynamic> j) => PendingOp(
        clientUuid: j['clientUuid'] as String,
        label: j['label'] as String,
        path: j['path'] as String,
        body: Map<String, dynamic>.from(j['body'] as Map),
        createdAt: DateTime.parse(j['createdAt'] as String),
        status: OpStatus.values.firstWhere(
          (s) => s.name == j['status'],
          orElse: () => OpStatus.pending,
        ),
        lastError: j['lastError'] as String?,
        attempts: (j['attempts'] as num?)?.toInt() ?? 0,
      );

  String encode() => jsonEncode(toJson());
  factory PendingOp.decode(String s) =>
      PendingOp.fromJson(jsonDecode(s) as Map<String, dynamic>);
}
