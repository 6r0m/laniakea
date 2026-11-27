# Duplication acquisition

PMD CPD collection and the run-bound evidence supplied to Review.

## Source duplication

`cpd.py` runs optional PMD CPD 7.29.0 over an isolated snapshot of source files in recorded in-target project modules.
`SourceTree` constrains physical reads to the project and declared plugin mounts; target excludes remain applicable.
Engine, build intermediates and out-of-target modules are not scanned. Explicit root-relative prefixes bound the corpus;
use target excludes for vendor source inside an otherwise selected module. This is raw-source analysis, independent of
LLVM and of which preprocessing branches compile. It does not infer function ownership from line proximity.

Offline `setup-health` copies the supplied PMD libraries and notices into the ignored workspace and compiles the small
CPD API adapter with a supplied JDK 11+. The installation pins hashes of libraries, adapter and Java executable. Its
complete file inventory must match the tool manifest; additional files are refused before reuse or execution. Reinstall
replaces the library and generated-class directories, so obsolete classpath entries do not survive setup. No host
installation, network download or source modification occurs during extraction. Map opening does not invoke CPD.
See [third-party terms](../../../../THIRD_PARTY.md) and [operator commands](../../../../docs/guide.md#collect-source-duplication).

The adapter uses CPD's own token images for strict-match fingerprints and exports exact line/column ranges without source
text. Identifier/literal normalization is off. It verifies every input was processed and every match's token count and
identity agree. An absent terminal newline is supplied only in the isolated tool copy because PMD's preprocessor lexer
requires it; original bytes still own hashes and existing token coordinates do not move.

Ordinary CLI builds request `--health auto`; programmatic `health_options=None` remains off and an explicit empty options
object remains required collection. Native indexing is independently explicit. `--health duplication` requires complete
successful collection. `--health auto` permits a validated module/native graph with explicitly unavailable, failed or
incomplete duplication coverage; it never substitutes old observations or an empty
successful report. `--health off` skips collection. Tool integrity failure refuses execution. Core input, physical-boundary,
graph validation, superseded corpus and unknown internal failures still reject publication. Later health hashes cannot
replace an earlier mandatory/native input identity: disagreement rejects the complete candidate. Known provider-local
read/write failures report failed acquisition; bounded artifact limits report incomplete acquisition. Malformed evidence
remains a validation failure. Required failures retain the previous map and committed settings. Module extraction through
`--health off` remains independent of Java and C++ content scans when native indexing is off.
Structured outcomes use the existing [manifest coverage contract](../../../docs/architecture/graph-model.md#coverage); Review does not own acquisition.

Input paths preserve source spelling because PMD sorts file IDs case-sensitively. Windows case folding is restricted to
lookup, never used to rename analyzer input. The recorded collection revision prevents reuse from incompatible input
ordering; the provider identity and token fingerprints retain their original meaning for Review decisions.

One corpus-wide result can be reused only for identical source hashes, membership/owners, scope, threshold, collection
revision and tool identity. Adding or removing a file invalidates reuse. Compilation changes affect triage context and the selected module
corpus; raw token matching has no additional compiler context. The run records analysis time, file/group counts and reuse.
The [provider](../../cpd.py) resolves an omitted collection floor and heap budget; explicit CLI values
override those defaults. Changing the heap alone does not invalidate semantic reuse. Before a new JVM, Windows physical
and commit availability must cover the heap, non-heap allowance and host headroom; unavailable or unreadable capacity
refuses launch. This admission check is not a memory reservation or a guarantee against concurrent host pressure.
Admission budgets the whole configured heap plus non-heap allowance, with a proportional host reserve bounded for small
and large development machines. The [budget implementation](../../cpd_budget.py) owns the numerical policy;
the representative-host regressions cover feasible launches, physical/commit pressure and unavailable measurements.
The JVM uses a bounded heap and processor-count setting, with a 15-minute timeout; its processor count is not an OS CPU
quota. Resource refusal never changes thresholds, excludes files or partitions cross-module matching. Artifact size remains
bounded to 32 MiB. Input snapshots and diagnostics remain in the run's ignored directory.

The manifest binds optional health observations by digest; pipeline validation precedes publication. Absence remains
compatible with older runs. [Review](../../../docs/architecture/review.md) interprets observations and owns thresholds/decisions independently of
extraction. Clang-Tidy complexity has not passed its real-context product gate and is not enabled.
