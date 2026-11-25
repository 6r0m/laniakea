// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleSession : ModuleRules
{
	public SampleSession(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "SampleMatchResult" });
		PrivateDependencyModuleNames.Add("SampleMatch");
	}
}
