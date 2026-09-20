import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('behavior_evals', Path(__file__).resolve().parents[1] / 'scripts/behavior_evals.py')
evals = importlib.util.module_from_spec(spec)
spec.loader.exec_module(evals)


class BehaviorEvalTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.run = Path(self.temp.name) / 'trial'

    def test_unreviewed_trial_does_not_pass(self):
        evals.prepare('diagnosis-only', self.run)
        report = evals.grade(self.run, self.run / 'review.json')
        self.assertFalse(report['passed'])
        self.assertEqual(report['review_status'], 'incomplete')

    def test_trial_contains_current_generated_agent_pack(self):
        evals.prepare('diagnosis-only', self.run)
        workspace = self.run / 'workspace'
        self.assertTrue((workspace / 'scripts/instincts.py').is_file())
        self.assertIn('instincts.py select', (workspace / 'AGENTS.md').read_text())
        self.assertTrue((workspace / '.claude/instincts/testing-pattern.md').is_file())

    def reviewed(self):
        review = json.loads((self.run / 'review.json').read_text())
        review.update(reviewer='maintainer', agent='manual-test', transcript='transcript.txt')
        (self.run / 'transcript.txt').write_text('Agent inspected the file and explained the issue without editing.')
        for item in review['criteria'].values():
            item.update(passed=True, evidence='transcript.txt:1 — inspection and explanation, no edits')
        (self.run / 'review.json').write_text(json.dumps(review))

    def test_review_and_unchanged_files_can_pass(self):
        evals.prepare('diagnosis-only', self.run)
        self.reviewed()
        report = evals.grade(self.run, self.run / 'review.json')
        self.assertTrue(report['passed'])
        self.assertEqual(report['method'], 'human-review-and-artifact-checks')

    def test_artifact_change_overrides_positive_review(self):
        evals.prepare('diagnosis-only', self.run)
        self.reviewed()
        (self.run / 'workspace' / 'calc.py').write_text('fixed')
        self.assertFalse(evals.grade(self.run, self.run / 'review.json')['passed'])

    def test_missing_transcript_does_not_pass(self):
        evals.prepare('diagnosis-only', self.run)
        self.reviewed()
        (self.run / 'transcript.txt').unlink()
        self.assertFalse(evals.grade(self.run, self.run / 'review.json')['passed'])

    def test_prepare_preserves_existing_directory(self):
        self.run.mkdir()
        with self.assertRaises(ValueError):
            evals.prepare('diagnosis-only', self.run)
        self.assertEqual(list(self.run.iterdir()), [])

    def test_all_scenarios_have_real_criteria(self):
        for name in evals.cases():
            trial = self.run.parent / name
            evals.prepare(name, trial)
            self.assertTrue((trial / 'PROMPT.md').read_text().strip())
            self.assertFalse(evals.grade(trial, trial / 'review.json')['passed'])
