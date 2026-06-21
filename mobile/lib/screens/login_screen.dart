import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../state/app_state.dart';
import '../services/api_client.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _mobile = TextEditingController();
  final _code = TextEditingController();
  bool _codeStep = false;
  bool _busy = false;
  String? _error;

  Future<void> _request() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await context.read<AppState>().auth.requestOtp(_mobile.text.trim());
      setState(() => _codeStep = true);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final s = context.read<AppState>();
      final user = await s.auth.verifyOtp(_mobile.text.trim(), _code.text.trim());
      await s.login(user);
    } on ApiException catch (e) {
      setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 360),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Text('Annrashtra DST',
                      style: TextStyle(fontSize: 26, fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  const Text('Promoter app', style: TextStyle(color: Colors.black54)),
                  const SizedBox(height: 28),
                  if (!_codeStep) ...[
                    TextField(
                      controller: _mobile,
                      keyboardType: TextInputType.phone,
                      decoration: const InputDecoration(
                          labelText: 'Mobile number', border: OutlineInputBorder()),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _busy ? null : _request,
                      child: Text(_busy ? 'Sending…' : 'Send OTP'),
                    ),
                  ] else ...[
                    TextField(
                      controller: _code,
                      keyboardType: TextInputType.number,
                      decoration: InputDecoration(
                          labelText: 'OTP sent to ${_mobile.text}',
                          border: const OutlineInputBorder()),
                    ),
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _busy ? null : _verify,
                      child: Text(_busy ? 'Verifying…' : 'Verify & sign in'),
                    ),
                    TextButton(
                      onPressed: _busy ? null : () => setState(() => _codeStep = false),
                      child: const Text('Change number'),
                    ),
                  ],
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 12),
                      child: Text(_error!, style: const TextStyle(color: Colors.red)),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
