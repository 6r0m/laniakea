// SPDX-License-Identifier: MIT

using UnrealBuildTool;

public class SampleEditor : ModuleRules
{
	public SampleEditor(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;
		PublicDependencyModuleNames.AddRange(new string[] { "Core", "CoreUObject" });
		PrivateDependencyModuleNames.AddRange(new string[] { "Engine", "UnrealEd", "EditorScriptingUtilities", "SampleGameplay", "SampleCore" });
		PrivateDependencyModuleNames.Add("SampleExperiment");
		PrivateIncludePathModuleNames.Add("AssetTools");
		DynamicallyLoadedModuleNames.Add("Settings");
	}
}
