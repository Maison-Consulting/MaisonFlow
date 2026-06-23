import { makeListService } from '../lib/listService.js';

// One service per SharePoint list (spec §3). Each exposes
// list / create / update / remove. FKs resolved client-side.
export const skillService = makeListService('Skill', 'skillId');
export const resourceService = makeListService('Resource', 'resourceId');
export const resourceSkillService = makeListService('ResourceSkill', 'resourceSkillId');
export const projectService = makeListService('Project', 'projectId');
export const projectSkillService = makeListService('ProjectSkill', 'projectSkillId');
export const assignmentService = makeListService('ProjectAssignment', 'assignmentId');
export const trackingService = makeListService('ProjectTracking', 'trackingId');
export const taskService = makeListService('ProjectTask', 'taskId');
export const riskService = makeListService('ProjectRisk', 'riskId');
export const meetingService = makeListService('SteeringMeeting', 'meetingId');
export const paymentService = makeListService('ProjectPayment', 'paymentId');

export const allServices = {
  Skill: skillService,
  Resource: resourceService,
  ResourceSkill: resourceSkillService,
  Project: projectService,
  ProjectSkill: projectSkillService,
  ProjectAssignment: assignmentService,
  ProjectTracking: trackingService,
  ProjectTask: taskService,
  ProjectRisk: riskService,
  SteeringMeeting: meetingService,
  ProjectPayment: paymentService,
};
