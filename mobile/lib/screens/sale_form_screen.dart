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
  final Map<String, int> _qty = {}; // product_id -> qty
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final p = await context.read<AppState>().products();
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
                          labelText: 'Customer mobile (for invoice)', border: OutlineInputBorder()),
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
  final ValueChanged<int> onChanged;
  const _ProductRow({required this.product, required this.qty, required this.onChanged});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text('${product['name']}'),
        subtitle: Text('₹${product['price']}'),
        trailing: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            IconButton(
              onPressed: qty > 0 ? () => onChanged(qty - 1) : null,
              icon: const Icon(Icons.remove_circle_outline),
            ),
            Text('$qty', style: const TextStyle(fontSize: 16)),
            IconButton(
              onPressed: () => onChanged(qty + 1),
              icon: const Icon(Icons.add_circle_outline),
            ),
          ],
        ),
      ),
    );
  }
}
