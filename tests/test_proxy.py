"""Offline regression tests. Responses below are synthetic, not live bird observations."""
import importlib.util
import json
from pathlib import Path
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'proxy' / 'local_server.py'
spec = importlib.util.spec_from_file_location('local_server', path)
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

class ProxyTest(unittest.TestCase):
    def test_parent_child_records_are_preserved(self):
        payload = json.dumps([{'locId': 'L22179490', 'subId': 'S900000001', 'speciesCode': 'spbduc'}]).encode()
        with patch.object(server, 'ebird_get', return_value=payload) as upstream:
            self.assertEqual(server.recent('SYNTHETIC_TEST_KEY', 'L3968639', 30, 'CN-33'), payload)
            upstream.assert_called_once_with('SYNTHETIC_TEST_KEY', '/data/obs/L3968639/recent?back=30&sppLocale=zh_SIM&includeProvisional=true')

    def test_unrecognized_locations_are_preserved(self):
        payload = b'[{"locId":"L999999","subId":"S900000099"}]'
        with patch.object(server, 'ebird_get', return_value=payload) as upstream:
            self.assertEqual(server.recent('TEST', 'L22179490', 30), payload)
            self.assertEqual(upstream.call_count, 1)

    def test_empty_result_stays_empty(self):
        with patch.object(server, 'ebird_get', return_value=b'[]'):
            self.assertEqual(server.recent('TEST', 'L3968639', 30), b'[]')

if __name__ == '__main__':
    unittest.main()
