// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleResults : ModuleRules
{
	public SampleResults(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "SampleSession", "SampleStandings" });
	}
}
