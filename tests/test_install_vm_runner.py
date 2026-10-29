"""Pure installer URL checks; these tests never install, connect, or read secrets."""

import argparse
import importlib.util
from pathlib import Path
import unittest


INSTALLER = Path(__file__).resolve().parents[1] / "infra" / "install-vm-runner.py"
SPEC = importlib.util.spec_from_file_location("prewarmer_installer", INSTALLER)
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class WorkerOriginTests(unittest.TestCase):
    def test_canonical_https_origins(self):
        cases = {
            "https://prewarmer.example.com": "https://prewarmer.example.com",
            "HTTPS://PREWARMER.EXAMPLE.COM:443/": "https://prewarmer.example.com",
            "https://prewarmer.example.com:8443/": "https://prewarmer.example.com:8443",
            "https://192.0.2.1/": "https://192.0.2.1",
            "https://[2001:db8::1]:443/": "https://[2001:db8::1]",
            "https://xn--bcher-kva.example/": "https://xn--bcher-kva.example",
        }
        for value, expected in cases.items():
            with self.subTest(value=value):
                self.assertEqual(installer.validate_worker_origin(value), expected)

    def test_rejects_credentials_and_non_origin_components(self):
        values = [
            "http://prewarmer.example.com",
            "//prewarmer.example.com",
            "https://user:password@prewarmer.example.com",
            "https://@prewarmer.example.com",
            "https://prewarmer.example.com/api",
            "https://prewarmer.example.com//",
            "https://prewarmer.example.com/%2e",
            "https://prewarmer.example.com?token=synthetic",
            "https://prewarmer.example.com?",
            "https://prewarmer.example.com/#fragment",
            "https://prewarmer.example.com#",
        ]
        for value in values:
            with self.subTest(value=value):
                self.assertRaises(ValueError, installer.validate_worker_origin, value)

    def test_rejects_ambiguous_or_malformed_authorities(self):
        values = [
            "https://",
            "https:///prewarmer.example.com",
            "https://prewarmer.example.com:",
            "https://prewarmer.example.com:0",
            "https://prewarmer.example.com:65536",
            "https://prewarmer.example.com:not-a-port",
            "https://prewarmer.example.com\\other.example.com",
            "https://prewarmer%2eexample.com",
            "https://[fe80::1%25eth0]",
            "https://[v1.example]",
            "https://127.1",
            "https://0x7f000001",
            "https://-prewarmer.example.com",
            "https://prewarmer..example.com",
            "https://bücher.example",
            " https://prewarmer.example.com",
            "https://prewarmer.example.com\n",
            "https://prewarmer.\texample.com",
            "https://prewarmer.example.com\x00",
        ]
        for value in values:
            with self.subTest(value=value):
                self.assertRaises(ValueError, installer.validate_worker_origin, value)

    def test_rejects_non_strings(self):
        for value in [None, 42, {}, [], ""]:
            with self.subTest(value=value):
                self.assertRaises(ValueError, installer.validate_worker_origin, value)

    def test_cli_validation_error_omits_supplied_credentials(self):
        with self.assertRaises(argparse.ArgumentTypeError) as result:
            installer.worker_origin_argument("https://synthetic-user:synthetic-password@example.com")
        self.assertNotIn("synthetic-user", str(result.exception))
        self.assertNotIn("synthetic-password", str(result.exception))


if __name__ == "__main__":
    unittest.main()
