# Main view

Laniakea's parts and the externals they meet. Each arrow names the contract it goes through. Nothing inside a part is
drawn.

```mermaid
flowchart LR
    subgraph laniakea["laniakea clone"]
        CLI["CLI: extract, serve, up"] -->|"profile contract"| Profile["unreal profile"]
        CLI -->|"run folders, latest.json"| Workspace[("workspace/ (ignored)")]
        Profile -->|"schema v1 graph"| Shards["shards"]
        Shards -->|"schema v1 shards"| Workspace
        Server["loopback server"] -->|"reads latest runs"| Workspace
        Viewer["viewer page"] -->|"HTTP on 127.0.0.1"| Server
    end
    Profile -->|"reads .uproject, .uplugin, build inputs"| Project[("analysed project")]
    Profile -->|"-Mode=QueryTargets, -Mode=JsonExport"| UBT[("engine: Unreal Build Tool")]
    UBT -->|"evaluates rules; refreshes its own caches"| Project
    Viewer -->|"vscode://file links"| Editor[("code editor")]
```
