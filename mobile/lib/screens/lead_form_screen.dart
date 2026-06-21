import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';

class LeadFormScreen extends StatefulWidget {
  const LeadFormScreen({super.key});

  @override
  State<LeadFormScreen> createState() => _LeadFormScreenState();
}

class _LeadFormScreenState extends State<LeadFormScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _mobile = TextEditingController();
  String? _concern;
  String? _interest;

  Future<void> _save() async {
    if (!_form.currentState!.validate()) return;
    await context.read<AppState>().queueWrite(
      label: 'Lead: ${_name.text.isEmpty ? _mobile.text : _name.text}',
      path: '/api/leads',
      body: {
        'name': _name.text.trim(),
        'mobile': _mobile.text.trim(),
        if (_concern != null) 'health_concern': _concern,
        if (_interest != null) 'product_interest': _interest,
      },
    );
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Lead saved — will sync when online')),
    );
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Capture lead')),
      body: Form(
        key: _form,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            TextFormField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Name', border: OutlineInputBorder()),
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _mobile,
              keyboardType: TextInputType.phone,
              decoration: const InputDecoration(labelText: 'Mobile *', border: OutlineInputBorder()),
              validator: (v) => (v == null || v.trim().length < 10) ? 'Enter a valid mobile' : null,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _concern,
              decoration: const InputDecoration(labelText: 'Health concern', border: OutlineInputBorder()),
              items: const ['diabetes', 'weight_loss', 'fitness']
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (v) => setState(() => _concern = v),
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              initialValue: _interest,
              decoration: const InputDecoration(labelText: 'Product interest', border: OutlineInputBorder()),
              items: const ['800g', '4kg']
                  .map((e) => DropdownMenuItem(value: e, child: Text(e)))
                  .toList(),
              onChanged: (v) => setState(() => _interest = v),
            ),
            const SizedBox(height: 20),
            FilledButton.icon(onPressed: _save, icon: const Icon(Icons.save), label: const Text('Save lead')),
          ],
        ),
      ),
    );
  }
}
