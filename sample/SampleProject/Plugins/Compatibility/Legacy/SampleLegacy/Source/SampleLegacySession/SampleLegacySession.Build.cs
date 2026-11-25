// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleLegacySession : ModuleRules
{
	public SampleLegacySession(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.Add("Core");
		PrivateDependencyModuleNames.Add("SampleLegacyStats");
		CircularlyReferencedDependentModules.Add("SampleLegacyStats");
	}
}
