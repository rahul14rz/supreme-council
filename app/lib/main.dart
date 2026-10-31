import 'package:flutter/material.dart';

import 'api.dart';
import 'screens/debate_screen.dart';
import 'screens/history_screen.dart';
import 'screens/providers_screen.dart';

void main() => runApp(SupremeCouncilApp(api: Api()));

class SupremeCouncilApp extends StatelessWidget {
  const SupremeCouncilApp({super.key, required this.api});
  final Api api;

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Supreme Council',
      theme: ThemeData(colorSchemeSeed: const Color(0xFF6A4C93), useMaterial3: true),
      darkTheme: ThemeData(colorSchemeSeed: const Color(0xFF6A4C93), brightness: Brightness.dark, useMaterial3: true),
      home: HomeScreen(api: api),
    );
  }
}

class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key, required this.api});
  final Api api;

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  int _tab = 0;

  @override
  Widget build(BuildContext context) {
    // History and Providers are rebuilt on every tab switch so they always show fresh data.
    final screens = [
      DebateScreen(api: widget.api),
      HistoryScreen(key: ValueKey('history-$_tab'), api: widget.api),
      ProvidersScreen(key: ValueKey('providers-$_tab'), api: widget.api),
    ];
    return Scaffold(
      appBar: AppBar(title: const Text('Supreme Council')),
      body: IndexedStack(index: _tab, children: screens),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _tab,
        onDestinationSelected: (i) => setState(() => _tab = i),
        destinations: const [
          NavigationDestination(icon: Icon(Icons.forum_outlined), label: 'Debate'),
          NavigationDestination(icon: Icon(Icons.history), label: 'History'),
          NavigationDestination(icon: Icon(Icons.dns_outlined), label: 'Providers'),
        ],
      ),
    );
  }
}
