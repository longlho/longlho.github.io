"""Project-specific TypeScript wrappers for gazelle_ts."""

load("@aspect_rules_ts//ts:defs.bzl", _ts_config = "ts_config", _ts_project = "ts_project")

def ts_config(name, src, **kwargs):
    _ts_config(
        name = name,
        src = src,
        **kwargs
    )

def ts_library(name, srcs, **kwargs):
    _ts_project(
        name = name,
        srcs = srcs,
        no_emit = True,
        tsconfig = "//:tsconfig",
        **kwargs
    )
