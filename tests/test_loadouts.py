import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    'loadouts', Path(__file__).resolve().parents[1] / 'scripts/loadouts.py')
loadouts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(loadouts)


def data(item):
    return {'loadouts': {'demo': {'provides': {'skills': [item]}}}}


class LoadoutCheckTests(unittest.TestCase):
    """A loadout may name a skill the store installs, but must say where from."""

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        root = Path(self.directory.name)
        (root / 'claude-code/skills/local/vendored').mkdir(parents=True)
        (root / 'claude-code/skills/local/vendored/SKILL.md').write_text('---\nname: vendored\n---\n')
        (root / 'skills').mkdir(parents=True)
        (root / 'skills/install-third-party.sh').write_text(
            'REPOS=(\n  owner/installed   # a comment\n)\n')
        for extra in ('claude-code/agents', 'claude-code/hooks',
                      'templates/shared/agent/instincts'):
            (root / extra).mkdir(parents=True)
        self.root = root
        self.output = patch('builtins.print')
        self.output.start()
        self.addCleanup(self.output.stop)
        for target in (patch.object(loadouts, 'ROOT', root),
                       patch.object(loadouts.Path, 'home', return_value=root / 'nohome')):
            target.start()
            self.addCleanup(target.stop)

    def check(self, payload):
        source = self.root / 'loadouts.json'
        source.write_text(json.dumps(payload))
        with patch.object(loadouts, 'SOURCE', source):
            return loadouts.check()

    def item(self, **overrides):
        values = {'id': 'vendored', 'scope': 'global', 'why': 'because'}
        values.update(overrides)
        return values

    def test_vendored_skill_resolves(self):
        self.assertEqual(0, self.check(data(self.item())))

    def test_absent_skill_without_provenance_fails(self):
        self.assertEqual(1, self.check(data(self.item(id='absent'))))

    def test_external_skill_names_a_repository_the_installer_installs(self):
        self.assertEqual(0, self.check(
            data(self.item(id='absent', external='owner/installed'))))
        self.assertEqual(1, self.check(
            data(self.item(id='absent', external='owner/unknown'))))

    def test_external_is_rejected_for_a_vendored_skill(self):
        self.assertEqual(1, self.check(data(self.item(external='owner/installed'))))

    def test_external_is_rejected_outside_skills(self):
        payload = {'loadouts': {'demo': {'provides': {
            'mcp': [{'id': 'anything', 'why': 'because', 'external': 'owner/installed'}]}}}}
        self.assertEqual(1, self.check(payload))

    def test_installer_repositories_come_from_the_script(self):
        script = self.root / 'skills/install-third-party.sh'
        script.write_text('REPOS=(\n  a/one  # note\n  b/two\n)\n'
                          'npx -y skills@latest add c/three -g\n')
        self.assertEqual({'a/one', 'b/two', 'c/three'},
                         loadouts.installer_repos(script))


class ShippedLoadoutTests(unittest.TestCase):
    def test_every_shipped_loadout_resolves(self):
        with patch('builtins.print'):
            self.assertEqual(0, loadouts.check())


if __name__ == '__main__':
    unittest.main()
