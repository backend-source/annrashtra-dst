import 'package:flutter_test/flutter_test.dart';

import 'package:annrashtra_promoter/models/pending_op.dart';

void main() {
  test('PendingOp round-trips through JSON', () {
    final op = PendingOp(
      clientUuid: 'abc',
      label: 'Lead: Asha',
      path: '/api/leads',
      body: {'mobile': '9999999999', 'client_uuid': 'abc'},
      createdAt: DateTime.parse('2026-06-21T10:00:00Z'),
    );
    final decoded = PendingOp.decode(op.encode());
    expect(decoded.clientUuid, 'abc');
    expect(decoded.path, '/api/leads');
    expect(decoded.body['mobile'], '9999999999');
    expect(decoded.status, OpStatus.pending);
  });
}
