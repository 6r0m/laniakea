// SPDX-License-Identifier: AGPL-3.0-or-later

using UnrealBuildTool;

public class SampleGameplay : ModuleRules
{
	public SampleGameplay(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject", "Engine", "SampleCore" });
	}
}
