# SPDX-License-Identifier: AGPL-3.0-or-later
"""Preparing Unreal compiler arguments for clangd's text-only analysis."""

from .. import LaniakeaError


def textual_includes(arguments):
    """Forward forced headers to cc1 in order, avoiding the driver's adjacent-PCH substitution.

    clangd-indexer disables binary PCH after driver processing; an implicitly substituted
    PCH otherwise erases the original header. Other argument semantics remain the caller's.
    Input is a tokenized argument vector, never a shell command.
    """
    result = []
    index = 0
    while index < len(arguments):
        argument = arguments[index]
        index += 1
        if argument == "-Xclang":
            if index == len(arguments):
                raise LaniakeaError("-Xclang is missing its argument")
            result.extend((argument, arguments[index]))
            index += 1
            continue
        if argument in ("/FI", "-include"):
            if index == len(arguments) or not arguments[index]:
                raise LaniakeaError(f"{argument} is missing its header")
            header = arguments[index]
            index += 1
        elif argument.startswith("/FI"):
            header = argument[3:]
        else:
            result.append(argument)
            continue
        result.extend(("-Xclang", "-include", "-Xclang", header))
    return result
