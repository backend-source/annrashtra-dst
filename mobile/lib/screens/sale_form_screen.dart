import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/api_client.dart';

class SaleFormScreen extends StatefulWidget {
  const SaleFormScreen({super.key});

  @override
  State<SaleFormScreen> createState() => _SaleFormScreenState();
}

class _SaleFormScreenState extends State<SaleFormScreen> {
  final _customer = TextEditingController();
  final _customerName = TextEditingController();
  String _payment = 'cash';
  List<Map<String, dynamic>> _products = [];
  List<Map<String, dynamic>> _cycle = []; // today's stock cycle per product
  bool _stockKnown = false; // false => couldn't load stock (don't cap)
  final Map<String, int> _qty = {}; // product_id -> qty
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final s = context.read<AppState>();
    try {
      final p = await s.products();
      // Stock is best-effort: if it loads we cap quantities; if not, we let the
      // server backstop flag any oversell rather than block selling blindly.
      try {
        _cycle = await s.dailyCycle();
        _stockKnown = true;
      } catch (_) {
        _stockKnown = false;
      }
      setState(() {
        _products = p;
        _loading = false;
      });
    } on ApiException catch (e) {
      setState(() {
        _error = 'No product list available offline (${e.message})';
        _loading = false;
      });
    }
  }

  // Quantity for this product already sitting in the unsynced queue, so we don't
  // let it be sold twice before those sales reach the server.
  int _queuedQty(String pid) {
    var q = 0;
    for (final op in context.read<AppState>().queue) {
      if (op.path != '/api/sales') continue;
      final items = (op.body['items'] as List?) ?? const [];
      for (final it in items) {
        if ('${(it as Map)['product_id']}' == pid) q += (it['qty'] as num?)?.toInt() ?? 0;
      }
    }
    return q;
  }

  // Units the promoter can still sell now. null => stock unknown (no cap).
  // 0 => out of stock or opening not set by admin (blocked).
  int? _availableFor(String pid) {
    if (!_stockKnown) return null;
    final row = _cycle.firstWhere((r) => '${r['product_id']}' == pid, orElse: () => const {});
    final num base = row.isEmpty
        ? 0
        : ((row['opening'] ?? 0) as num) + ((row['refill'] ?? 0) as num) - ((row['sold'] ?? 0) as num);
    final avail = base.toInt() - _queuedQty(pid);
    return avail < 0 ? 0 : avail;
  }

  double get _total {
    var t = 0.0;
    for (final p in _products) {
      final q = _qty[p['id']] ?? 0;
      t += (double.tryParse('${p['price']}') ?? 0) * q;
    }
    return t;
  }

  Future<void> _save() async {
    final items = _products
        .where((p) => (_qty[p['id']] ?? 0) > 0)
        .map((p) => {'product_id': p['id'], 'qty': _qty[p['id']]})
        .toList();
    if (items.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Add at least one item')));
      return;
    }
    // Final stock guard — block the over-quantity line rather than the whole sale.
    for (final p in _products) {
      final q = _qty[p['id']] ?? 0;
      if (q <= 0) continue;
      final avail = _availableFor('${p['id']}');
      if (avail != null && q > avail) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(avail == 0
              ? '${p['name']}: no stock in hand. Ask admin to set opening stock or request a refill.'
              : '${p['name']}: only $avail in stock. Reduce the quantity.'),
        ));
        return;
      }
    }
    if (!RegExp(r'^\d{10}$').hasMatch(_customer.text.trim())) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Customer mobile must be 10 digits')));
      return;
    }
    await context.read<AppState>().queueWrite(
      label: 'Sale: ₹${_total.toStringAsFixed(0)}',
      path: '/api/sales',
      body: {
        'payment_mode': _payment,
        if (_customer.text.trim().isNotEmpty) 'customer_mobile': _customer.text.trim(),
        if (_customerName.text.trim().isNotEmpty) 'customer_name': _customerName.text.trim(),
        'items': items,
      },
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Sale saved — will sync & send invoice when online')),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Record sale')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(child: Padding(padding: const EdgeInsets.all(24), child: Text(_error!)))
              : ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    ..._products.map((p) => _ProductRow(
                          product: p,
                          qty: _qty[p['id']] ?? 0,
                          available: _availableFor('${p['id']}'),
                          onChanged: (q) => setState(() => _qty[p['id']] = q),
                        )),
                    const SizedBox(height: 8),
                    TextField(
                      controller: _customerName,
                      decoration: const InputDecoration(
                          labelText: 'Customer name', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _customer,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                          labelText: 'Customer mobile * (10 digits)', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 12),
                    DropdownButtonFormField<String>(
                      initialValue: _payment,
                      decoration: const InputDecoration(labelText: 'Payment', border: OutlineInputBorder()),
                      items: const ['cash', 'upi']
                          .map((e) => DropdownMenuItem(value: e, child: Text(e.toUpperCase())))
                          .toList(),
                      onChanged: (v) => setState(() => _payment = v ?? 'cash'),
                    ),
                    const SizedBox(height: 16),
                    Text('Total: ₹${_total.toStringAsFixed(2)}',
                        style: const TextStyle(fontSize: 18, fontWeight: FontWeight.bold)),
                    const SizedBox(height: 16),
                    FilledButton.icon(onPressed: _save, icon: const Icon(Icons.save), label: const Text('Save sale')),
                  ],
                ),
    );
  }
}

class _ProductRow extends StatelessWidget {
  final Map<String, dynamic> product;
  final int qty;
  final int? available; // null => stock unknown (no cap)
  final ValueChanged<int> onChanged;
  const _ProductRow({required this.product, required this.qty, required this.available, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    final atLimit = available != null && qty >= available!;
    final outOfStock = available == 0;
    final stockLabel = available == null
        ? ''
        : outOfStock
            ? ' · no stock'
            : ' · $available in stock';
    return Card(
      child: ListTile(
        title: Text('${product['name']}'),
        subtitle: Text(
          '₹${product['price']}$stockLabel',
          style: outOfStock ? const TextStyle(color: Colors.red) : null,
        ),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              onPressed: qty > 0 ? () => onChanged(qty - 1) : null,
              icon: const Icon(Icons.remove_circle_outline),
            ),
            Text('$qty', style: const TextStyle(fontSize: 16)),
            IconButton(
              // Can't add past available stock; disabled entirely when out of stock.
              onPressed: atLimit ? null : () => onChanged(qty + 1),
              icon: const Icon(Icons.add_circle_outline),
            ),
          ],
        ),
      ),
    );
  }
}
