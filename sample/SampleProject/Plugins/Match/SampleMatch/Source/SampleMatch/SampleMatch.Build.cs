// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleMatch : ModuleRules
{
	public SampleMatch(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "SampleMatchResult" });
		PrivateDependencyModuleNames.AddRange(new string[] {
			"SampleCore", "SampleGameplay", "SampleMatchRules", "SampleMatchReplay", "SampleMatchValidation" });
	}
}
