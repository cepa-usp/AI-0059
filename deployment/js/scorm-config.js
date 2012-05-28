var learnername = ""; // Nome do aluno
var completed = false; // Status da AI: completada ou não
var score = 0; // Nota do aluno (de 0 a 100)
var scormExercise = 1; // Exercício corrente relevante ao SCORM
var screenExercise = 1; // Exercício atualmente visto pelo aluno (não tem relação com scormExercise)
var N_EXERCISES = 2; // Quantidade de exercícios desta AI
var scorm = pipwerks.SCORM; // Seção SCORM
scorm.version = "2004"; // Versão da API SCORM
var PING_INTERVAL = 5 * 60 * 1000;  // milissegundos
var pingCount = 0; // Conta a quantidade de pings enviados para o LMS
var MAX_INIT_TRIES = 60;
var init_tries = 0;
var debug = true;

// Inicia a AI.
$(document).ready(function(){
  
  //Deixa a aba "Orientações" ativa no carregamento da atividade
  $('#exercicios').tabs({ selected: 0 }); 
  
  // Habilita/desabilita a visualização do ponto P
  $('#exercicios').tabs({
    select: function(event, ui) {
    
      screenExercise = ui.index;
    
      if (screenExercise == 2) document.ggbApplet.setVisible('P', true);
      else document.ggbApplet.setVisible('P', false);
    }
  });

  $('#button1').button().click(evaluateExercise);
  $('#button2').button().click(evaluateExercise);
  $('#button3').button().click(reloadPage); 

  checkCallbacks();
});

function checkCallbacks () {
	var t2 = new Date().getTime();
	var ok = false;
	try {
		// Sorteia as coordenadas do ponto P
		var xcoord = -5 + Math.floor(11 * Math.random());
		var ycoord = -3 + Math.floor( 7 * Math.random());
		if (xcoord == 0 && ycoord == 0) ycoord = 1; // Só para não dar um vetor (0,0)
		document.ggbApplet.setCoords('P', xcoord, ycoord);
		ok = true;
		message("ok");
	}
	catch(error) {
		++init_tries;
		
		if (init_tries > MAX_INIT_TRIES) {
			alert("Carregamento falhou.");
		}
		else {
			message("falhou");
			setTimeout("checkCallbacks()", 1000);
		}
	}
	
	if(ok) initAI();
}

//Refresh da Página.
function reloadPage()
{
	document.getElementById("limpa").reset();
	window.location.reload() 
}

// Encerra a AI.
$(window).unload(function (){
  if (!completed) {
    save2LMS();
    scorm.quit();
  }
});

/*
 * Inicia a AI.
 */ 
function initAI () {
 
  // Conecta-se ao LMS
  var connected = scorm.init();
  
  // A tentativa de conexão com o LMS foi bem sucedida.
  if (connected) {
  
    // Verifica se a AI já foi concluída.
    var completionstatus = scorm.get("cmi.completion_status");
    
    // A AI já foi concluída.
    switch (completionstatus) {
    
      // Primeiro acesso à AI
      case "not attempted":
      case "unknown":
      default:
        completed = false;
        learnername = scorm.get("cmi.learner_name");
        scormExercise = 1;
        score = 0;
        
        $("#completion-message").removeClass().addClass("completion-message-off");      
        break;
        
      // Continuando a AI...
      case "incomplete":
        completed = false;
        learnername = scorm.get("cmi.learner_name");
        scormExercise = parseInt(scorm.get("cmi.location"));
        score = parseInt(scorm.get("cmi.score.raw"));
        
        $("#completion-message").removeClass().addClass("completion-message-off");
        break;
        
      // A AI já foi completada.
      case "completed":
        completed = true;
        learnername = scorm.get("cmi.learner_name");
        scormExercise = parseInt(scorm.get("cmi.location"));
        score = parseInt(scorm.get("cmi.score.raw"));
        
        $("#completion-message").removeClass().addClass("completion-message-on");
        break;
    }
    
    if (isNaN(scormExercise)) scormExercise = 1;
    if (isNaN(score)) score = 0;
    
    // Posiciona o aluno no exercício da vez
    screenExercise = scormExercise;
    $('#exercicios').tabs("select", scormExercise - 1); 
    
    // Habilita/desabilita a visualização da mediatriz
    if (scormExercise == 2) document.ggbApplet.setVisible('P', true);
    else document.ggbApplet.setVisible('P', false);
    
    pingLMS();
  }
  // A tentativa de conexão com o LMS falhou.
  else {
    completed = false;
    learnername = "";
    scormExercise = 1;
    score = 0;
    log.error("A conexão com o Moodle falhou.");
  }
  
  // (Re)abilita os exercícios já feitos e desabilita aqueles ainda por fazer.
  if (completed) $('#exercicios').tabs("option", "disabled", []);
  else {
	$('#exercicios').tabs((scormExercise >= 1 ? "enable": "disable"), 1);
	$('#exercicios').tabs((scormExercise >= 2 ? "enable": "disable"), 2);
  }
}

/*
 * Salva cmi.score.raw, cmi.location e cmi.completion_status no LMS
 */ 
function save2LMS () {
  if (scorm.connection.isActive) {
  
    // Salva no LMS a nota do aluno.
    var success = scorm.set("cmi.score.raw", score);
  
    // Notifica o LMS que esta atividade foi concluída.
    success = scorm.set("cmi.completion_status", (completed ? "completed" : "incomplete"));
    
    // Salva no LMS o exercício que deve ser exibido quando a AI for acessada novamente.
    success = scorm.set("cmi.location", scormExercise);
    
    if (!success) log.error("Falha ao enviar dados para o LMS.");
  }
  else {
    log.trace("A conexão com o LMS não está ativa.");
  }
}

/*
 * Mantém a conexão com LMS ativa, atualizando a variável cmi.session_time
 */
function pingLMS () {

	scorm.get("cmi.completion_status");
	var timer = setTimeout("pingLMS()", PING_INTERVAL);
}

/*
 * Avalia a resposta do aluno ao exercício atual. Esta função é executada sempre que ele pressiona "terminei".
 */ 
function evaluateExercise (event) {

  // Avalia a nota
  var currentScore = getScore(screenExercise);

  // Mostra a mensagem de erro/acerto
  feedback(screenExercise, currentScore);

  // Atualiza a nota do LMS (apenas se a questão respondida é aquela esperada pelo LMS)
  if (!completed && screenExercise == scormExercise) {
    score = Math.max(0, Math.min(score + currentScore, 100));
    
    if (scormExercise < N_EXERCISES) {
      nextExercise();
    }
    else {
      completed = true;
      scormExercise = 1;
      save2LMS();
      scorm.quit();
    }
  }
}

/*
 * Prepara o próximo exercício.
 */ 
function nextExercise () {
  if (scormExercise < N_EXERCISES) ++scormExercise;
  
  $('#exercicios').tabs("enable", scormExercise);
}

/*
 * Avalia a nota do aluno num dado exercício.
 */ 
function getScore (exercise) {

  ans = 0;

  switch (exercise) {
  
    // Avalia a nota do exercício 1
    case 1:
    default:
      var resultant_x = document.ggbApplet.getXcoord('P');
      var resultant_y = document.ggbApplet.getYcoord('P');
      var u_x = parseInt($('#r_x').val());
      var u_y = parseInt($('#r_y').val());
      var u_z = parseInt($('#r_z').val());
     
      if (resultant_x == u_x && resultant_y == u_y && u_z == 0) {
          ans = 50;
      } else {
          ans = 0;
      }
      
      break;
      
    // Avalia a nota do exercício 2
    case 2:
    
      var r_x = document.ggbApplet.getXcoord('P');
      var r_y = document.ggbApplet.getYcoord('P');
      
      if (r_x == 0 && r_y == 0) {
          ans = 50;
      } else {
          ans = 0;
      }    
    
      break;
  }
  
  return ans;
}

/*
 * Exibe a mensagem de erro/acerto (feedback) do aluno para um dado exercício e nota (naquele exercício).
 */ 
function feedback (exercise, score) {
                     
  switch (exercise) {
  
    // Feedback da resposta ao exercício 1
    case 1:
    default:
      if (score == 50) {
          $('#message1').html('<p/>Resposta correta!').removeClass().addClass("right-answer");
      } else {
          $('#message1').html('<p/>Resposta incorreta.').removeClass().addClass("wrong-answer");
      }
      
      break;
    
    // Feedback da resposta ao exercício 2
    case 2:
      if (score == 50) {
          $('#message2').html('<p/>Resposta correta!').removeClass().addClass("right-answer");
      } else {
          $('#message2').html('<p/>Resposta incorreta.').removeClass().addClass("wrong-answer");
      }
      
      break;
  }
}


var log = {};

log.trace = function (message) {
  if(window.console && window.console.firebug){
    console.log(message);
  }
  else {
    alert(message);
  }  
}

log.error = function (message) {
  if( (window.console && window.console.firebug) || console){
    console.error(message);
  }
  else {
    alert(message);
  }
}

// Mensagens de log
function message (m) {
	try {
		if (debug) console.log(m);
	}
	catch (error) {
		// Nada.
	}
}

