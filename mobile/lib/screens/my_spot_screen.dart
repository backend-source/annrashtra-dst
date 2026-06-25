import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/api_client.dart';
import '../services/location_service.dart';

// Promoter sets their canopy spot from their current GPS. The supervisor confirms
// it; a 150 m geofence is built around the captured point.
class MySpotScreen extends StatefulWidget {
  const MySpotScreen({super.key});

  @override
  State<MySpotScreen> createState() => _MySpotScreenState();
}

class _MySpotScreenState extends State<MySpotScreen> {
  final _name = TextEditingController();
  List<Map<String, dynamic>> _spots = [];
  bool _loading = true;
  bool _busy = false;
  double? _lat, _lng;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final s = await context.read<AppState>().locations();
      if (mounted) setState(() { _spots = s; _loading = false; });
    } on ApiException {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _capture() async {
    setState(() => _busy = true);
    try {
      final loc = await LocationService.current();
      setState(() { _lat = loc.lat; _lng = loc.lng; });
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e'.replaceFirst('Exception: ', ''))));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (_lat == null || _lng == null) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Capture your current location first')));
      return;
    }
    setState(() => _busy = true);
    try {
      await context.read<AppState>().proposeSpot(_lat!, _lng!, _name.text.trim());
      if (!mounted) return;
      _name.clear();
      setState(() { _lat = null; _lng = null; });
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Spot sent — waiting for supervisor to confirm')));
      await _load();
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.isNetwork ? 'Needs a connection' : e.message)));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('My spot')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const Text('Stand at your canopy spot, capture your location, and send it. '
              'Your supervisor confirms it and a 150 m area is set around it.',
              style: TextStyle(color: Colors.black54, fontSize: 13)),
          const SizedBox(height: 16),
          TextField(
            controller: _name,
            decoration: const InputDecoration(labelText: 'Spot name (optional)', border: OutlineInputBorder()),
          ),
          const SizedBox(height: 12),
          OutlinedButton.icon(
            onPressed: _busy ? null : _capture,
            icon: const Icon(Icons.my_location),
            label: Text(_lat == null ? 'Use my current location' : 'Captured: ${_lat!.toStringAsFixed(5)}, ${_lng!.toStringAsFixed(5)}'),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: _busy ? null : _submit,
            icon: const Icon(Icons.send),
            label: const Text('Send to supervisor'),
          ),
          const SizedBox(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('My spots', style: TextStyle(fontWeight: FontWeight.w600)),
              IconButton(onPressed: _load, icon: const Icon(Icons.refresh)),
            ],
          ),
          if (_loading) const Center(child: Padding(padding: EdgeInsets.all(16), child: CircularProgressIndicator())),
          if (!_loading && _spots.isEmpty) const Text('No spots yet.', style: TextStyle(color: Colors.black54)),
          ..._spots.map((s) {
            final active = s['status'] == 'active';
            return Card(
              child: ListTile(
                title: Text('${s['name']}'),
                subtitle: Text('${s['lat']?.toStringAsFixed(5) ?? '—'}, ${s['lng']?.toStringAsFixed(5) ?? '—'} · ${s['radius_m']}m'),
                trailing: Chip(
                  label: Text(active ? 'active' : 'pending'),
                  backgroundColor: active ? Colors.green.shade100 : Colors.orange.shade100,
                ),
              ),
            );
          }),
        ],
      ),
    );
  }
}
