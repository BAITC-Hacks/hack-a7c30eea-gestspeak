"""Select an isolated database before any test module imports the application."""
import os
import tempfile

_test_data = tempfile.TemporaryDirectory(prefix='gestspeak-tests-')
os.environ['GESTSPEAK_DATA'] = _test_data.name


def pytest_unconfigure(config):
    _test_data.cleanup()
