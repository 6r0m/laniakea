// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleProject : ModuleRules
{
	public SampleProject(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine" });
		PrivateDependencyModuleNames.AddRange(new string[] { "SampleGameplay", "SampleMatch", "SampleExperiment", "SampleResults" });
	}
}
