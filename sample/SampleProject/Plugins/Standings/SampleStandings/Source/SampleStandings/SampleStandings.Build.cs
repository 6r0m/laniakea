// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleStandings : ModuleRules
{
	public SampleStandings(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "SampleMatchResult" });
	}
}
