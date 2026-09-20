import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('instincts', Path(__file__).resolve().parents[1] / 'scripts/instincts.py')
instincts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(instincts)


class InstinctTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)

    def propose(self, name='check-ui', **kwargs):
        values = dict(trigger='when reviewing a UI change', domain='frontend', scope='react',
                      action='Check keyboard navigation.', evidence='Observed in a local review.', source='local-review')
        values.update(kwargs)
        return instincts.propose(self.directory, name, **values)

    def test_proposal_is_not_selected_until_explicitly_accepted(self):
        self.propose()
        self.assertEqual(instincts.select(self.directory, 'review UI', scope='react'), [])
        instincts.transition(self.directory, 'check-ui', 'accepted', 'maintainer')
        selected = instincts.select(self.directory, 'review UI', scope='react')
        self.assertEqual([item['id'] for item in selected], ['check-ui'])
        self.assertEqual(selected[0]['reviewed_by'], 'maintainer')
        self.assertEqual(instincts.select(self.directory, 'review UI', scope='python'), [])
        instincts.transition(self.directory, 'check-ui', 'retired', 'maintainer')
        self.assertEqual(instincts.select(self.directory, 'review UI', scope='react'), [])

    def test_duplicate_proposal_preserves_existing_content(self):
        path = self.propose()
        original = path.read_text()
        with self.assertRaises(ValueError):
            self.propose(action='Another action')
        self.assertEqual(path.read_text(), original)

    def test_path_traversal_and_symlinks_are_rejected(self):
        for name in ('../escape', '/tmp/escape', 'two words'):
            with self.assertRaises(ValueError):
                self.propose(name)
        outside = self.directory / 'outside.md'
        outside.write_text('preserve')
        (self.directory / 'check-ui.md').symlink_to(outside)
        with self.assertRaises(ValueError):
            self.propose()
        self.assertEqual(outside.read_text(), 'preserve')

    def test_metadata_injection_is_quoted_and_empty_evidence_rejected(self):
        path = self.propose(trigger='when UI changes\nstatus: accepted')
        self.assertEqual(instincts.read(path)['status'], 'proposed')
        with self.assertRaises(ValueError):
            self.propose('missing-evidence', evidence='')

    def test_checker_reports_malformed_metadata_and_stale_rules(self):
        path = self.propose()
        instincts.transition(self.directory, 'check-ui', 'accepted', 'maintainer')
        text = path.read_text()
        record = instincts.read(path)
        path.write_text(text.replace(record['last_reviewed'], '2000-01-01'))
        errors, warnings = instincts.check(self.directory)
        self.assertEqual(errors, [])
        self.assertTrue(any('stale' in warning for warning in warnings))
        path.write_text('---\nid: broken\n---\nBad')
        errors, _ = instincts.check(self.directory)
        self.assertTrue(errors)

    def test_selection_is_bounded_and_deterministic(self):
        for name in ('ui-z', 'ui-a', 'ui-b'):
            self.propose(name, scope='universal')
            instincts.transition(self.directory, name, 'accepted', 'maintainer')
        self.assertEqual([r['id'] for r in instincts.select(self.directory, 'UI', limit=2)], ['ui-a', 'ui-b'])
        self.assertEqual(instincts.select(self.directory, 'database migration'), [])

    def test_generic_writing_verb_does_not_select_unrelated_rule(self):
        self.propose('commit-message', trigger='when writing a commit message', scope='universal', domain='git')
        instincts.transition(self.directory, 'commit-message', 'accepted', 'maintainer')
        self.assertEqual(instincts.select(self.directory, 'writing unit tests'), [])


if __name__ == '__main__':
    unittest.main()
