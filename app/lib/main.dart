import 'package:flutter/material.dart';

import 'api.dart';
import 'screens/debate_screen.dart';
import 'screens/history_screen.dart';
import 'screens/providers_screen.dart';
import 'theme.dart';

void main() => runApp(SupremeCouncilApp(api: Api()));

class SupremeCouncilApp extends StatelessWidget {
  const SupremeCouncilApp({super.key, required this.api});
  final Api api;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Supreme Council',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(),
        home: HomeScreen(api: api),
      );
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
      body: SafeArea(
        bottom: false,
        child: Column(children: [
          Container(
            height: 56,
            padding: const EdgeInsets.symmetric(horizontal: Space.s24),
            alignment: Alignment.centerLeft,
            decoration: const BoxDecoration(border: Border(bottom: BorderSide(color: Palette.hairline))),
            child: const Text('Supreme Council', style: TextStyle(fontFamily: 'Plex Serif', fontSize: 18, color: Palette.text)),
          ),
          Expanded(child: IndexedStack(index: _tab, children: screens)),
        ]),
      ),
      bottomNavigationBar: Container(
        decoration: const BoxDecoration(border: Border(top: BorderSide(color: Palette.hairline))),
        child: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
          destinations: const [
            NavigationDestination(icon: Icon(Icons.forum_outlined), selectedIcon: Icon(Icons.forum), label: 'Debate'),
            NavigationDestination(icon: Icon(Icons.history), label: 'History'),
            NavigationDestination(icon: Icon(Icons.dns_outlined), selectedIcon: Icon(Icons.dns), label: 'Providers'),
          ],
        ),
      ),
    );
  }
}
