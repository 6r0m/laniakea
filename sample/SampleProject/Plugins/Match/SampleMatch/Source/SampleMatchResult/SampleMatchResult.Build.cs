// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleMatchResult : ModuleRules
{
	public SampleMatchResult(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.Add("Core");
	}
}
